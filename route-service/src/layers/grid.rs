use geo_types::Polygon;
use petgraph::{graph::NodeIndex, Directed, Graph};
use rstar::{RTree, RTreeObject, AABB};
use rusqlite::{params, Connection, Result};
use std::{collections::HashMap, str::FromStr, sync::Arc};
use wkt::Wkt;

// Layer 1 - Data structure describing grid network and O-D matrix data
pub struct GridNetwork {
    /// Allows for spatial querying of zones (nodes)
    pub rtree: RTree<RTreeNode>,
    /// Allows for relations between zones (if needed) e.g. travel demand between 2 zones
    pub graph: Graph<Zone, Link>,
}

impl GridNetwork {
    pub fn load(dbname: &str) -> Result<Arc<GridNetwork>> {
        let conn = Connection::open(dbname)?;

        let links = read_links(&conn)?;
        let zones = read_zones(&conn)?;

        let mut rtree = RTree::<RTreeNode>::new();
        let mut graph = Graph::<Zone, Link, Directed>::new();
        let mut node_map = HashMap::<u32, NodeIndex>::new();

        for zone in zones {
            let node_index = graph.add_node(zone);
            let envelope = compute_envelope(&graph[node_index].polygon);
            rtree.insert(RTreeNode {
                envelope: envelope,
                node_index: node_index,
            });
            node_map.insert(graph[node_index].zoneid, node_index);
        }

        for link in links {
            if let (Some(&from_node), Some(&to_node)) =
                (node_map.get(&link.origid), node_map.get(&link.destid))
            {
                graph.add_edge(from_node, to_node, link);
            }
        }

        Ok(Arc::new(GridNetwork {
            rtree: rtree,
            graph: graph,
        }))
    }

    pub fn find_nearest_zone(&self, x: f64, y: f64) -> Option<NodeIndex> {
        let point = [x, y];
        let nearest = self.rtree.locate_at_point(&point).unwrap();
        Some(nearest.node_index)
    }

    pub fn demand_between_zones(&self, from: NodeIndex, to: NodeIndex) -> f64 {
        let link = self.graph.find_edge(from, to).unwrap();
        self.graph[link].weight
    }

    pub fn demand_between_coords(&self, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
        let from = self.find_nearest_zone(x1, y1).unwrap();
        let to = self.find_nearest_zone(x2, y2).unwrap();
        self.demand_between_zones(from, to)
    }
}

pub struct Link {
    pub origid: u32,
    pub destid: u32,
    pub weight: f64,
}

pub struct Zone {
    pub zoneid: u32,
    pub polygon: Polygon<f64>,
}

struct RTreeNode {
    envelope: AABB<[f64; 2]>,
    node_index: NodeIndex,
}

impl rstar::PointDistance for RTreeNode {
    fn distance_2(&self, point: &[f64; 2]) -> f64 {
        self.envelope.distance_2(point)
    }
}

impl RTreeObject for RTreeNode {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}

fn compute_envelope(polygon: &Polygon<f64>) -> AABB<[f64; 2]> {
    let exterior = polygon.exterior();
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for coord in exterior.coords() {
        if coord.x < min_x {
            min_x = coord.x;
        }
        if coord.y < min_y {
            min_y = coord.y;
        }
        if coord.x > max_x {
            max_x = coord.x;
        }
        if coord.y > max_y {
            max_y = coord.y;
        }
    }

    AABB::from_corners([min_x, min_y], [max_x, max_y])
}

fn read_links(conn: &Connection) -> Result<Vec<Link>> {
    let mut stmt = conn.prepare("SELECT origid, destid, volume FROM demand")?;
    let link_iter = stmt.query_map(params![], |row| {
        Ok(Link {
            origid: row.get(0)?,
            destid: row.get(1)?,
            weight: row.get(2)?,
        })
    })?;
    Ok(Vec::from_iter(link_iter.map(|x| x.unwrap())))
}

fn read_zones(conn: &Connection) -> Result<Vec<Zone>> {
    let mut stmt = conn.prepare("SELECT zoneid, geom FROM zones")?;
    let zone_iter = stmt.query_map(params![], |row| {
        let wkt_str: String = row.get(1)?;
        let wkt = Wkt::from_str(&wkt_str).unwrap();
        let polygon: Polygon<f64> = wkt.try_into().unwrap();
        Ok(Zone {
            zoneid: row.get(0)?,
            polygon: polygon,
        })
    })?;
    Ok(Vec::from_iter(zone_iter.map(|x| x.unwrap())))
}
