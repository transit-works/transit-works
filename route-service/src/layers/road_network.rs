use clap::FromArgMatches;
use geo_types::{LineString, Point};
use geo::{algorithm::Length, Euclidean, EuclideanLength};
use petgraph::{algo::astar, graph::{node_index, NodeIndex}, Directed, Graph};
use rstar::{RTree, RTreeObject, AABB};
use rusqlite::{params, Connection, Result};
use std::{collections::HashMap, str::FromStr, sync::Arc};
use wkt::Wkt;

// Layer 2 - Graph data strcture to store the nodes and edges of a city street network
pub struct RoadNetwork {
    /// Allows for spatial querying of intersection (nodes)
    rtree: RTree<RTreeNode>,
    /// Allows for relational querying of intersection connectons (nodes) via roads (edges)
    graph: Graph<Node, Edge>,
}

impl RoadNetwork {
    pub fn print_stats(&self) {
        println!("Road network:");
        println!("  Nodes: {}", self.graph.node_count());
        println!("  Edges: {}", self.graph.edge_count());
    }

    pub fn load(dbname: &str) -> Result<Arc<RoadNetwork>> {
        let conn = Connection::open(dbname)?;

        let nodes = read_nodes(&conn)?;
        let edges = read_edges(&conn)?;

        let mut rtree = RTree::<RTreeNode>::new();
        let mut graph = Graph::<Node, Edge, Directed>::new();
        let mut node_map = HashMap::<u64, NodeIndex>::new();

        for node in nodes {
            let node_index = graph.add_node(node);
            let envelope = compute_envelope(&graph[node_index].geom);
            rtree.insert(RTreeNode {
                envelope: envelope,
                node_index: node_index,
            });
            node_map.insert(graph[node_index].osmid, node_index);
        }

        for edge in edges {
            if let (Some(&from_node), Some(&to_node)) =
                (node_map.get(&edge.u), node_map.get(&edge.v))
            {
                graph.add_edge(from_node, to_node, edge);
            }
        }

        Ok(Arc::new(RoadNetwork {
            rtree: rtree,
            graph: graph,
        }))
    }

    pub fn find_nearest_node(&self, x: f64, y: f64) -> Option<NodeIndex> {
        let point = [x, y];
        let nearest = self.rtree.nearest_neighbor(&point).unwrap();
        Some(nearest.node_index)
    }

    pub fn edge_weight(edge: &Edge) -> f64 {
        let from = edge.geom.0.first();
        let to = edge.geom.0.last();

        let weight = edge.geom.length::<Euclidean>();

        weight
    }
    
    pub fn get_road_distance(&self, fx : f64, fy : f64, tx : f64, ty : f64) -> (f64, Vec<NodeIndex>){

        let from : NodeIndex = self.find_nearest_node(fx, fy).unwrap();
        let to : NodeIndex = self.find_nearest_node(tx, ty).unwrap();

        let heuristic = |n: NodeIndex| {
            let a = self.graph[n].geom;
            let b = self.graph[to].geom;
            ((a.x() - b.x()).powi(2) + (a.y() - b.y()).powi(2)).sqrt()
        };

        let res = astar(&self.graph, from, |node| node == to, |e| Self::edge_weight(e.weight()), heuristic);

        if let Some((cost, path)) = res{
            (cost, path)
        }
        else{
            (0.0, vec![])
        }
    }
    
}

struct Node {
    fid: u64,
    geom: Point,
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

fn compute_envelope(point: &Point<f64>) -> AABB<[f64; 2]> {
    return AABB::from_point(point.x_y().into());
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
