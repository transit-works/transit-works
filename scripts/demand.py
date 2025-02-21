import enum
import sqlite3
import dataclasses

import osmnx as ox
import pyrosm as po
import shapely as shp
import networkx as nx
import geopandas as gpd

from math import radians, sin, cos, sqrt, atan2

@dataclasses.dataclass
class City:
    nodes: gpd.GeoDataFrame
    edges: gpd.GeoDataFrame
    pois: gpd.GeoDataFrame
    landuse: gpd.GeoDataFrame

class Mode(enum.IntEnum):
    BIKE = 1
    CAR = 2
    TRANSIT = 3

class TimePeriod(enum.IntEnum):
    MORNING = 1
    MORNING_RUSH_HOUR = 2
    MIDDAY = 3
    EVENING_RUSH_HOUR = 4
    NIGHT = 5

class Landuse(enum.Enum):
    COMMERCIAL = 'commercial'
    RETAIL = 'retail'
    INDUSTRIAL = 'industrial'
    RESIDENTIAL = 'residential'

# Distance decay parameter for gravity model (0.8-2.0)
GRAVITY_BETA = 0.5

# Importance of each landuse type in attractiveness calculation at different times of day
LANDUSE_WEIGHTS = {
    Landuse.COMMERCIAL.value: {
        TimePeriod.MORNING: 0.5,
        TimePeriod.MORNING_RUSH_HOUR: 1.0,
        TimePeriod.MIDDAY: 0.7,
        TimePeriod.EVENING_RUSH_HOUR: 1.0,
        TimePeriod.NIGHT: 0.5,
    },
    Landuse.RETAIL.value: {
        TimePeriod.MORNING: 0.6,
        TimePeriod.MORNING_RUSH_HOUR: 1.0,
        TimePeriod.MIDDAY: 1.0,
        TimePeriod.EVENING_RUSH_HOUR: 1.0,
        TimePeriod.NIGHT: 0.6,
    },
    Landuse.INDUSTRIAL.value: {
        TimePeriod.MORNING: 0.5,
        TimePeriod.MORNING_RUSH_HOUR: 1.0,
        TimePeriod.MIDDAY: 1.0,
        TimePeriod.EVENING_RUSH_HOUR: 1.0,
        TimePeriod.NIGHT: 0.5,
    },
    Landuse.RESIDENTIAL.value: {
        TimePeriod.MORNING: 0.5,
        TimePeriod.MORNING_RUSH_HOUR: 0.5,
        TimePeriod.MIDDAY: 0.7,
        TimePeriod.EVENING_RUSH_HOUR: 1.0,
        TimePeriod.NIGHT: 0.7,
    },
}

# Importance of POI vs landuse in attractiveness calculation (0.0-1.0)
POIS_WEIGHT = 0.7

# Mode choice
MODE_CHOICE = {
    Mode.BIKE: 0.2,
    Mode.CAR: 0.4,
    Mode.TRANSIT: 0.4,
}

def run_gravity_model(zones: gpd.GeoDataFrame, distances: list[list[float]]) -> list[list[dict[TimePeriod, float]]]:
    demand_matrix = [[{} for _ in range(len(zones))] for _ in range(len(zones))]
    for _, zone1 in zones.iterrows():
        for _, zone2 in zones.iterrows():
            idx1, idx2 = zone1['zone_id'], zone2['zone_id']
            if idx1 == idx2: continue
            attractiveness_by_time1 = zone1['attractiveness']
            attractiveness_by_time2 = zone2['attractiveness']
            distance = distances[idx1][idx2]
            for time_period in TimePeriod:
                attractiveness1 = attractiveness_by_time1[time_period]
                attractiveness2 = attractiveness_by_time2[time_period]
                trips = attractiveness1 * attractiveness2 / distance ** GRAVITY_BETA
                demand_matrix[idx1][idx2][time_period] = trips
    return demand_matrix

def calculate_zone_attractiveness(city: City, zones: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    zones['attractiveness'] = 0
    zone_attractiveness = {}
    for _, zone in zones.iterrows():
        geom = zone['geometry']
        zone_id = zone['zone_id']
        try:
            pois = city.pois.clip(geom)
            landuse = city.landuse.clip(geom)
        except Exception:
            zone_attractiveness[zone_id] = {time_period: 0 for time_period in TimePeriod}
            continue
        pois_score = pois['amenity'].value_counts().sum()
        attractiveness_by_time = {}
        for time_period in TimePeriod:
            landuse_score = landuse['landuse'].map(LANDUSE_WEIGHTS).apply(lambda x: x[time_period]).sum()
            attractiveness_by_time[time_period] = landuse_score * (1 - POIS_WEIGHT) + pois_score * POIS_WEIGHT
        zone_attractiveness[zone_id] = attractiveness_by_time
    zones['attractiveness'] = zones['zone_id'].map(zone_attractiveness)
    return zones

def calculate_network_distance(city: City, zones: gpd.GeoDataFrame) -> list[list[float]]:
    # graph = ox.graph_from_gdfs(city.nodes, city.edges)
    # graph = ox.project_graph(graph)
    # def euclidean_distance(u, v):
    #     u_x, u_y = graph.nodes[u]['x'], graph.nodes[u]['y']
    #     v_x, v_y = graph.nodes[v]['x'], graph.nodes[v]['y']
    #     return ((u_x - v_x)**2 + (u_y - v_y)**2)**0.5
    def haversine(coord1, coord2):
        R = 6371
        lat1, lon1 = radians(coord1[0]), radians(coord1[1])
        lat2, lon2 = radians(coord2[0]), radians(coord2[1])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c
    distances = [[0 for _ in range(len(zones))] for _ in range(len(zones))]
    for i, zone1 in zones.iterrows():
        for j, zone2 in zones.iterrows():
            # print(f"Calculating distance between zones {i} and {j}")
            geom1, geom2 = zone1['geometry'], zone2['geometry']
            # node1 = ox.nearest_nodes(graph, geom1.centroid.x, geom1.centroid.y)
            # node2 = ox.nearest_nodes(graph, geom2.centroid.x, geom2.centroid.y)
            idx1, idx2 = zone1['zone_id'], zone2['zone_id']
            # distances[idx1][idx2] = nx.astar_path_length(graph, node1, node2, heuristic=euclidean_distance, weight='length')
            # distances[idx1][idx2] = euclidean_distance(node1, node2)
            coord1 = geom1.centroid.y, geom1.centroid.x
            coord2 = geom2.centroid.y, geom2.centroid.x
            distances[idx1][idx2] = haversine(coord1, coord2)
    return distances

def divide_into_zones(city: City, num_rows: int, num_cols: int) -> gpd.GeoDataFrame:
    bbox = city.nodes.total_bounds
    x_min, y_min, x_max, y_max = bbox
    x_range = x_max - x_min
    y_range = y_max - y_min
    x_step = x_range / num_cols
    y_step = y_range / num_rows
    zones = []
    for i in range(num_rows):
        for j in range(num_cols):
            x1 = x_min + j * x_step
            y1 = y_min + i * y_step
            x2 = x1 + x_step
            y2 = y1 + y_step
            zones.append({
                'geometry': shp.geometry.box(x1, y1, x2, y2),
                'zone_id': i * num_cols + j
            })
    zones = gpd.GeoDataFrame(zones)
    return zones

def load_data_from_pbf(file_path: str) -> City:
    osm = po.OSM(file_path)
    nodes, edges = osm.get_network(nodes=True, network_type='driving')
    # Structure the gdf for OSMNx compatibility
    edges.set_index(['u', 'v', 'id'], inplace=True)
    nodes.set_index('id', inplace=True)
    nodes['x'] = nodes['lon']
    nodes['y'] = nodes['lat']
    pois = osm.get_pois(custom_filter={'amenity': True})
    landuse = osm.get_landuse(custom_filter={'landuse': [x.value for x in Landuse]})
    return City(nodes, edges, pois, landuse)

def load_db(
    conn: sqlite3.Connection,
    zones: gpd.GeoDataFrame,
    distances: list[list[float]],
    demand_matrix: list[list[dict[TimePeriod, float]]],
):
    conn.executemany('INSERT INTO zone VALUES (?, ?, ?)', [
        (idx, geom, attractiveness)
        for idx, (geom, attractiveness) in zones[['geometry', 'attractiveness']].iterrows()
    ])
    conn.commit()
    conn.executemany('INSERT INTO demand VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        (
            idx1, 
            idx2, 
            distances[idx1][idx2], 
            max(demand_matrix[idx1][idx2].values()), 
            demand_matrix[idx1][idx2][TimePeriod.MORNING],
            demand_matrix[idx1][idx2][TimePeriod.MORNING_RUSH_HOUR],
            demand_matrix[idx1][idx2][TimePeriod.MIDDAY],
            demand_matrix[idx1][idx2][TimePeriod.EVENING_RUSH_HOUR],
            demand_matrix[idx1][idx2][TimePeriod.NIGHT],
        )
        for idx1, _ in zones.iterrows()
        for idx2, _ in zones.iterrows()
    ])
    conn.commit()

def main():
    import time

    print("Loading city data...")
    start = time.time()
    city = load_data_from_pbf('city_data/toronto/data/Toronto.osm.pbf')
    print(f"Data loaded in {time.time() - start:.2f} seconds")

    print("Dividing city into zones...")
    zones = divide_into_zones(city, 100, 100)

    print("Calculating zone attractiveness...")
    start = time.time()
    zones = calculate_zone_attractiveness(city, zones)
    print(f"Zone attractiveness calculated in {time.time() - start:.2f} seconds")

    print("Calculating network distances...")
    start = time.time()
    distances = calculate_network_distance(city, zones)
    print(f"Network distances calculated in {time.time() - start:.2f} seconds")

    print("Running gravity model...")
    start = time.time()
    demand_matrix = run_gravity_model(zones, distances)
    print(f"Gravity model ran in {time.time() - start:.2f} seconds")

    print("Loading data into database...")
    conn = sqlite3.connect('city_db/toronto2.db')
    load_db(conn, zones, distances, demand_matrix)
    conn.close()

    print("Done!")

if __name__ == '__main__':
    main()
