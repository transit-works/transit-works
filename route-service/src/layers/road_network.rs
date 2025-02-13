use geo::{algorithm::Length, BoundingRect, Distance, Haversine};
use geo_types::{LineString, Point};
use petgraph::{algo::astar, graph::NodeIndex, prelude::EdgeIndex, Directed, Graph};
use rstar::{PointDistance, RTree, RTreeObject, AABB};
use rusqlite::{params, Connection, Result};
use std::{collections::HashMap, str::FromStr, sync::Arc};
use wkt::Wkt;

use super::geo_util;

// Layer 2 - Graph data strcture to store the nodes and edges of a city street network
pub struct RoadNetwork {
    /// Allows for spatial querying of intersection (nodes)
    rtree_nodes: RTree<RTreeNode>,
    /// Allows for spatial querying of edges
    rtree_edges: RTree<RTreeEdge>,
    /// Allows for relational querying of intersection connectons (nodes) via roads (edges)
    graph: Graph<Node, Edge>,
}

impl RoadNetwork {
    pub fn print_stats(&self) {
        println!("Road network:");
        println!("  Nodes: {}", self.graph.node_count());
        println!("  Edges: {}", self.graph.edge_count());
    }

    pub fn get_node(&self, node_index: NodeIndex) -> &Node {
        &self.graph[node_index]
    }

    pub fn load(dbname: &str) -> Result<Arc<RoadNetwork>> {
        let conn = Connection::open(dbname)?;

        let nodes = read_nodes(&conn)?;
        let edges = read_edges(&conn)?;

        let mut rtree_nodes = RTree::<RTreeNode>::new();
        let mut rtree_edges = RTree::<RTreeEdge>::new();
        let mut graph = Graph::<Node, Edge, Directed>::new();
        let mut node_map = HashMap::<u64, NodeIndex>::new();

        for node in nodes {
            let node_index = graph.add_node(node);
            let envelope = compute_node_envelope(&graph[node_index].geom);
            rtree_nodes.insert(RTreeNode {
                envelope: envelope,
                node_index: node_index,
            });
            node_map.insert(graph[node_index].osmid, node_index);
        }

        for edge in edges {
            if let (Some(&from_node), Some(&to_node)) =
                (node_map.get(&edge.u), node_map.get(&edge.v))
            {
                let edge_index = graph.add_edge(from_node, to_node, edge);
                let envelope = compute_edge_envelope(&graph[edge_index]);
                rtree_edges.insert(RTreeEdge {
                    envelope: envelope,
                    edge_index: edge_index,
                });
            }
        }

        Ok(Arc::new(RoadNetwork {
            rtree_nodes: rtree_nodes,
            rtree_edges: rtree_edges,
            graph: graph,
        }))
    }

    pub fn find_nearest_node(&self, x: f64, y: f64) -> Option<NodeIndex> {
        let point = [x, y];
        let nearest = self.rtree_nodes.nearest_neighbor(&point).unwrap();
        Some(nearest.node_index)
    }

    pub fn find_nearest_nodes(&self, x: f64, y: f64, radius: f64) -> Vec<NodeIndex> {
        // get all the nodes in the envelope
        let envelope = geo_util::compute_envelope(y, x, radius);
        let mut nearest_nodes = Vec::new();
        for candidate in self.rtree_nodes.locate_in_envelope_intersecting(&envelope) {
            nearest_nodes.push(candidate.node_index);
        }
        // sort by distance to x, y ascending
        nearest_nodes.sort_by(|a, b| {
            let p = &Point::new(x, y);
            let a_dist = self.graph[*a].geom.distance_2(p);
            let b_dist = self.graph[*b].geom.distance_2(p);
            a_dist.partial_cmp(&b_dist).unwrap()
        });
        nearest_nodes
    }

    fn find_nearest_edge(&self, x: f64, y: f64) -> Option<EdgeIndex> {
        let mut nearest_dist = f64::INFINITY;
        let mut nearest_edge = None;

        let envelope = geo_util::compute_envelope(y, x, 100.0);
        let point = Point::new(x, y);
        for candidate in self.rtree_edges.locate_in_envelope_intersecting(&envelope) {
            let edge = &self.graph[candidate.edge_index];
            let dist = edge.geom.distance_2(&point);
            if dist < nearest_dist {
                nearest_dist = dist;
                nearest_edge = Some(candidate.edge_index);
            }
        }

        nearest_edge
    }

    fn get_road_distance_coords(&self, fx: f64, fy: f64, tx: f64, ty: f64) -> (f64, Vec<NodeIndex>) {
        let from = self.find_nearest_node(fx, fy).unwrap();
        let to = self.find_nearest_node(tx, ty).unwrap();
        self.get_road_distance(from, to)
    }

    pub fn get_road_distance(&self, from: NodeIndex, to: NodeIndex) -> (f64, Vec<NodeIndex>) {
        let heuristic = |n: NodeIndex| {
            let a = self.graph[n].geom;
            let b = self.graph[to].geom;
            Haversine::distance(a, b)
        };

        let edge_weight = |e: &Edge| e.geom.length::<Haversine>();

        let res = astar(
            &self.graph,
            from,
            |node| node == to,
            |e| edge_weight(e.weight()),
            heuristic,
        );

        if let Some((cost, path)) = res {
            (cost, path)
        } else {
            (0.0, vec![])
        }
    }
}

pub struct Node {
    fid: u64,
    pub geom: Point,
    osmid: u64,
}

struct RTreeNode {
    envelope: AABB<[f64; 2]>,
    node_index: NodeIndex,
}

impl rstar::PointDistance for RTreeNode {
    fn distance_2(&self, point: &[f64; 2]) -> f64 {
        let node_point = self.envelope.lower();
        let dx = node_point[0] - point[0];
        let dy = node_point[1] - point[1];
        dx * dx + dy * dy
    }
}

impl RTreeObject for RTreeNode {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}

fn compute_node_envelope(point: &Point<f64>) -> AABB<[f64; 2]> {
    return AABB::from_point(point.x_y().into());
}

struct RTreeEdge {
    envelope: AABB<[f64; 2]>,
    edge_index: EdgeIndex,
}

impl RTreeObject for RTreeEdge {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}

fn compute_edge_envelope(edge: &Edge) -> AABB<[f64; 2]> {
    let rect = edge.geom.bounding_rect().unwrap();
    let min_x = rect.min().x;
    let min_y = rect.min().y;
    let max_x = rect.max().x;
    let max_y = rect.max().y;
    AABB::from_corners([min_x, min_y], [max_x, max_y])
}

struct Edge {
    fid: u64,
    geom: LineString,
    u: u64,
    v: u64,
    key: u64,
    osmid: u64,
}

fn read_edges(conn: &Connection) -> Result<Vec<Edge>> {
    let mut stmt = conn.prepare("SELECT fid, geom, u, v, key, osmid FROM edges")?;
    let edge_iter = stmt.query_map(params![], |row| {
        let wkt_str: String = row.get(1)?;
        let wkt = Wkt::from_str(&wkt_str).unwrap();
        let line_string: LineString = wkt.try_into().unwrap();
        Ok(Edge {
            fid: row.get(0)?,
            geom: line_string,
            u: row.get(2)?,
            v: row.get(3)?,
            key: row.get(4)?,
            osmid: row.get(5)?,
        })
    })?;
    Ok(Vec::from_iter(edge_iter.map(|x| x.unwrap())))
}

fn read_nodes(conn: &Connection) -> Result<Vec<Node>> {
    let mut stmt = conn.prepare("SELECT fid, geom, osmid FROM nodes")?;
    let node_iter = stmt.query_map(params![], |row| {
        let wkt_str: String = row.get(1)?;
        let wkt = Wkt::from_str(&wkt_str).unwrap();
        let coord: Point = wkt.try_into().unwrap();
        Ok(Node {
            fid: row.get(0)?,
            geom: coord,
            osmid: row.get(2)?,
        })
    })?;
    Ok(Vec::from_iter(node_iter.map(|x| x.unwrap())))
}
