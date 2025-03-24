use geo_types::Polygon;
use petgraph::{graph::NodeIndex, Directed, Graph};
use rstar::{RTree, RTreeObject, AABB};
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, str::FromStr};
use wkt::Wkt;

// Layer 1 - Data structure describing grid network and O-D matrix data
#[derive(Deserialize, Serialize)]
pub struct GridNetwork {
    /// Allows for spatial querying of zones (nodes)
    pub rtree: RTree<RTreeNode>,
    /// Allows for relations between zones (if needed) e.g. travel demand between 2 zones
    pub graph: Graph<Zone, Link>,
    /// Mapping of zone id to Zone node index
    node_map: HashMap<u32, NodeIndex>,
}

impl GridNetwork {
    pub fn print_stats(&self) {
        println!("Grid network:");
        println!("  Zones: {}", self.graph.node_count());
        println!("  Links: {}", self.graph.edge_count());
    }

    pub fn load(dbname: &str) -> Result<GridNetwork> {
        let conn = Connection::open(dbname)?;

        let links = read_links2(&conn).unwrap_or_else(|_| {
            log::error!("Failed to read links with time data, falling back to reading links without time data");
            read_links(&conn).unwrap()
        });
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

        Ok(GridNetwork {
            rtree: rtree,
            graph: graph,
            node_map: node_map,
        })
    }

    pub fn find_nearest_zone(&self, x: f64, y: f64) -> Option<NodeIndex> {
        let point = [x, y];
        match self.rtree.locate_at_point(&point) {
            Some(nearest) => Some(nearest.node_index),
            None => None,
        }
    }

    pub fn get_zone(&self, node_index: NodeIndex) -> &Zone {
        &self.graph[node_index]
    }

    pub fn get_zone_idx_by_id(&self, zoneid: u32) -> NodeIndex {
        self.node_map[&zoneid]
    }

    pub fn demand_between_zones(&self, from: NodeIndex, to: NodeIndex) -> f64 {
        let link = self.graph.find_edge(from, to).unwrap();
        self.graph[link].weight
    }

    pub fn link_between_zones(&self, from: NodeIndex, to: NodeIndex) -> Option<&Link> {
        self.graph.find_edge(from, to).map(|link| &self.graph[link])
    }

    pub fn demand_between_coords(&self, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
        match (
            self.find_nearest_zone(x1, y1),
            self.find_nearest_zone(x2, y2),
        ) {
            (Some(from), Some(to)) => self.demand_between_zones(from, to),
            _ => 0.0,
        }
    }

    pub fn get_all_valid_zones(&self) -> Vec<NodeIndex> {
        self.graph
            .node_indices()
            .filter(|&node| self.get_zone(node).valid_zone())
            .collect()
    }
}

#[derive(PartialOrd, Ord, Clone, Deserialize, Serialize, Hash, Eq, PartialEq)]
pub enum TimePeriod {
    Morning,
    AmRush,
    MidDay,
    PmRush,
    Evening,
}

impl TimePeriod {
    pub fn to_number(&self) -> usize {
        match self {
            TimePeriod::Morning => 1,
            TimePeriod::AmRush => 2,
            TimePeriod::MidDay => 3,
            TimePeriod::PmRush => 4,
            TimePeriod::Evening => 5,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Link {
    pub origid: u32,
    pub destid: u32,
    pub weight: f64,
    #[serde(default)]
    pub weight_by_time: HashMap<TimePeriod, f64>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Zone {
    pub zoneid: u32,
    pub polygon: Polygon<f64>,
    pub population: u32,
}

impl Zone {
    pub fn valid_zone(&self) -> bool {
        self.population > 0
    }
}

#[derive(Deserialize, Serialize)]
pub struct RTreeNode {
    envelope: AABB<[f64; 2]>,
    node_index: NodeIndex,
}

impl RTreeNode {
    pub fn get_node_index(&self) -> NodeIndex {
        self.node_index
    }
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
            weight_by_time: HashMap::new(),
        })
    })?;
    Ok(Vec::from_iter(link_iter.map(|x| x.unwrap())))
}

fn read_links2(conn: &Connection) -> Result<Vec<Link>> {
    let mut stmt = conn.prepare(
        "
SELECT \
    origid, \
    destid, \
    volume, \
    volume_morning, \
    volume_am_rush, \
    volume_mid_day, \
    volume_pm_rush, \
    volume_evening \
FROM \
    demand",
    )?;
    let link_iter = stmt.query_map(params![], |row| {
        Ok(Link {
            origid: row.get(0)?,
            destid: row.get(1)?,
            weight: row.get(2)?,
            weight_by_time: [
                (TimePeriod::Morning, row.get(3)?),
                (TimePeriod::AmRush, row.get(4)?),
                (TimePeriod::MidDay, row.get(5)?),
                (TimePeriod::PmRush, row.get(6)?),
                (TimePeriod::Evening, row.get(7)?),
            ]
            .into_iter()
            .collect(),
        })
    })?;
    Ok(Vec::from_iter(link_iter.map(|x| x.unwrap())))
}

fn read_zones(conn: &Connection) -> Result<Vec<Zone>> {
    let mut stmt = conn.prepare("SELECT zoneid, geom, population FROM zone")?;
    let zone_iter = stmt.query_map(params![], |row| {
        let wkt_str: String = row.get(1)?;
        let wkt = Wkt::from_str(&wkt_str).unwrap();
        let polygon: Polygon<f64> = wkt.try_into().unwrap();
        Ok(Zone {
            zoneid: row.get(0)?,
            polygon: polygon,
            population: row.get::<_, f64>(2)? as u32,
        })
    })?;
    Ok(Vec::from_iter(zone_iter.map(|x| x.unwrap())))
}
