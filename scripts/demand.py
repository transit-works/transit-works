import enum
import dataclasses

import osmnx as ox
import pyrosm as po
import shapely as shp
import geopandas as gpd

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
    for i, zone in zones.iterrows():
        geom = zone['geometry']
        if not geom.is_valid: geom = geom.make_valid()
        geom_gdf = gpd.GeoDataFrame(geometry=[geom], crs=zones.crs)
        pois = city.pois.clip(geom_gdf)
        landuse = city.landuse.clip(geom_gdf)
        pois_score = pois['amenity'].value_counts().sum()
        attractiveness_by_time = {}
        for time_period in TimePeriod:
            landuse_score = landuse['landuse'].apply(lambda x: LANDUSE_WEIGHTS.get(x, 0)[time_period]).sum()
            attractiveness_by_time[time_period] = landuse_score * (1 - POIS_WEIGHT) + pois_score * POIS_WEIGHT
        zones.at[i, 'attractiveness'] = attractiveness_by_time
    return zones

def calculate_network_distance(city: City, zones: gpd.GeoDataFrame) -> list[list[float]]:
    graph = ox.graph_from_gdfs(city.nodes, city.edges)
    distances = [[0 for _ in range(len(zones))] for _ in range(len(zones))]
    for _, zone1 in zones.iterrows():
        for _, zone2 in zones.iterrows():
            geom1, geom2 = zone1['geometry'], zone2['geometry']
            node1 = ox.get_nearest_node(graph, (geom1.centroid.y, geom1.centroid.x))
            node2 = ox.get_nearest_node(graph, (geom2.centroid.y, geom2.centroid.x))
            idx1, idx2 = zone1['zone_id'], zone2['zone_id']
            distances[idx1][idx2] = ox.distance.shortest_path_length(graph, node1, node2, weight='length')
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
    pois = osm.get_pois(custom_filter={'amenity': True})
    landuse = osm.get_landuse(custom_filter={'landuse': [x.value for x in Landuse]})
    return City(nodes, edges, pois, landuse)

def main():
    import time

    print("Loading city data...")
    start = time.time()
    city = load_data_from_pbf('city_data/toronto/data/Toronto.osm.pbf')
    print(f"Data loaded in {time.time() - start:.2f} seconds")

    print("Dividing city into zones...")
    zones = divide_into_zones(city, 10, 10)

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

    print("Done")
    for time_period in TimePeriod:
        print(f"Time period: {time_period}")
        for i, row in enumerate(demand_matrix):
            for j, demand in enumerate(row):
                print(f"Zone {i} -> Zone {j}: {demand[time_period]}")
        print("===========")

if __name__ == '__main__':
    main()
