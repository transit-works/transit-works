use geo_types::Polygon;
use petgraph::graph::{Graph, NodeIndex};
use petgraph::Directed;
use rstar::{RTree, RTreeObject, AABB};
use rusqlite::{params, Connection, Result};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use wkt::Wkt;

// Layer 1 - Data structure describing grid network and O-D matrix data
pub struct GridNetwork {
    tree: RTree<Node>, // TODO: the R-Tree needs to store the NodeIndex from the graph.
    graph: Graph<u32, f64>,
    zones: HashMap<u32, Zone>,
}

struct Link {
    origid: u32,
    destid: u32,
    weight: f64,
}

struct Zone {
    zoneid: u32,
    polygon: Polygon<f64>,
}

struct Node {
    zoneid: u32,
    envelope: AABB<[f64; 2]>,
}

impl RTreeObject for Node {
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
    let mut links = Vec::new();
    for link in link_iter {
        links.push(link?);
    }
    Ok(links)
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
    let mut zones = Vec::new();
    for zone in zone_iter {
        zones.push(zone?);
    }
    Ok(zones)
}

pub fn load(dbname: &str) -> Result<Arc<GridNetwork>> {
    let conn = Connection::open(dbname)?;

    let links = read_links(&conn)?;
    let zones = read_zones(&conn)?;

    let mut rtree = RTree::<Node>::new();
    let mut graph = Graph::<u32, f64, Directed>::new();
    let mut node_map = HashMap::<u32, NodeIndex>::new();
    let mut zone_map = HashMap::<u32, Zone>::new();

    for zone in zones {
        let envelope = compute_envelope(&zone.polygon);
        let node = Node {
            zoneid: zone.zoneid,
            envelope: envelope,
        };
        let nodeindex = graph.add_node(zone.zoneid);
        rtree.insert(node);
        node_map.insert(zone.zoneid, nodeindex);
        zone_map.insert(zone.zoneid, zone);
    }

    for link in links {
        if let (Some(&from_node), Some(&to_node)) =
            (node_map.get(&link.origid), node_map.get(&link.destid))
        {
            graph.add_edge(from_node, to_node, link.weight);
        }
    }

    Ok(Arc::new(GridNetwork {
        tree: rtree,
        graph: graph,
        zones: zone_map,
    }))
}
