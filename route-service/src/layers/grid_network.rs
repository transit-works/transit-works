use geo_types::Polygon;
use petgraph::{Graph, Directed, graph::NodeIndex};
use rstar::{RTree, RTreeObject, AABB};
use rusqlite::{params, Connection, Result};
use std::{collections::HashMap, str::FromStr, sync::Arc};
use wkt::Wkt;

// Layer 1 - Data structure describing grid network and O-D matrix data
pub struct GridNetwork {
    rtree: RTree<RTreeNode>,
    graph: Graph<Zone, Link>,
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

struct RTreeNode {
    envelope: AABB<[f64; 2]>,
    node_index: NodeIndex,
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
