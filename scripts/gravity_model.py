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
    buildings: gpd.GeoDataFrame

class Mode(enum.IntEnum):
    BIKE = 1
    CAR = 2
    TRANSIT = 3

class TimePeriod(enum.IntEnum):
    MORNING = 1
    AM_RUSH = 2
    MID_DAY = 3
    PM_RUSH = 4
    NIGHT = 5

class Landuse(enum.Enum):
    COMMERCIAL = 'commercial'
    RETAIL = 'retail'
    INDUSTRIAL = 'industrial'
    RESIDENTIAL = 'residential'

class Building(enum.Enum):
    APARTMENTS = 'apartments'
    BARRACKS = 'barracks'
    BUNGALOW = 'bungalow'
    DETACHED = 'detached'
    DORMITORY = 'dormitory'
    HOTEL = 'hotel'
    HOUSE = 'house'
    SEMIDETACHED_HOUSE = 'semidetached_house'

# Trips generated in the city every hour for each time period
TRIPS_GENERATED = {
    TimePeriod.MORNING: 20_000.0,
    TimePeriod.AM_RUSH: 150_000.0,
    TimePeriod.MID_DAY: 60_0000.0,
    TimePeriod.PM_RUSH: 150_000.0,
    TimePeriod.NIGHT: 20_000.0,
}

# Rough estimate of the number of people living in each building type
BUILDING_OCCUPANCY = {
    Building.APARTMENTS.value: 400,
    Building.BARRACKS.value: 200,
    Building.BUNGALOW.value: 4,
    Building.DETACHED.value: 4,
    Building.DORMITORY.value: 400,
    Building.HOTEL.value: 200,
    Building.HOUSE.value: 4,
    Building.SEMIDETACHED_HOUSE.value: 4,
}

# Distance decay parameter for gravity model (0.8-2.0)
GRAVITY_BETA = 0.5

# Weight of each landuse type in attraction calculation at different times of day
LAND_WEIGHTS = {
    Landuse.COMMERCIAL.value: {
        TimePeriod.MORNING: 0.5,
        TimePeriod.AM_RUSH: 1.0,
        TimePeriod.MID_DAY: 0.7,
        TimePeriod.PM_RUSH: 0.5,
        TimePeriod.NIGHT: 0.5,
    },
    Landuse.RETAIL.value: {
        TimePeriod.MORNING: 0.6,
        TimePeriod.AM_RUSH: 1.0,
        TimePeriod.MID_DAY: 1.0,
        TimePeriod.PM_RUSH: 1.0,
        TimePeriod.NIGHT: 0.6,
    },
    Landuse.INDUSTRIAL.value: {
        TimePeriod.MORNING: 0.5,
        TimePeriod.AM_RUSH: 1.0,
        TimePeriod.MID_DAY: 1.0,
        TimePeriod.PM_RUSH: 1.0,
        TimePeriod.NIGHT: 0.5,
    },
    Landuse.RESIDENTIAL.value: {
        TimePeriod.MORNING: 0.5,
        TimePeriod.AM_RUSH: 0.5,
        TimePeriod.MID_DAY: 0.7,
        TimePeriod.PM_RUSH: 1.0,
        TimePeriod.NIGHT: 0.7,
    },
}

# Relative importance of population vs poi vs landuse in attraction calculation (must sum to 1.0)
SCORE_POIS_WEIGHT = 0.3
SCORE_POPN_WEIGHT = 0.3
SCORE_LAND_WEIGHT = 0.4
assert SCORE_POIS_WEIGHT + SCORE_POPN_WEIGHT + SCORE_LAND_WEIGHT == 1.0

# https://www.princeton.edu/~alaink/Orf467F12/The%20Gravity%20Model.pdf
def gravity_model_demand_matrix(
        zones: gpd.GeoDataFrame, 
        distances: list[list[float]]
) -> list[list[dict[TimePeriod, float]]]:
    demand_matrix = [[{t: 0 for t in TimePeriod} for _ in range(len(zones))] for _ in range(len(zones))]
    for time_period in TimePeriod:
        print('Calculating demand for time period', time_period)
        for _, zone1 in zones.iterrows():
            print('  Calculating demand for zone', zone1['zone_id'])
            idx1 = zone1['zone_id']
            trips_denominator = 0
            for _, zone2 in zones.iterrows():
                idx2 = zone2['zone_id']
                if idx1 == idx2: continue
                production1 = zone1['production'][time_period]
                attraction2 = zone2['attraction'][time_period]
                distance = distances[idx1][idx2]
                impedance = 1 / (distance ** GRAVITY_BETA)
                trips_denominator += attraction2 * impedance
                trips_numerator = production1 * attraction2 * impedance
                demand_matrix[idx1][idx2][time_period] = trips_numerator
            # normalize demand
            for _, zone2 in zones.iterrows():
                idx2 = zone2['zone_id']
                demand_matrix[idx1][idx2][time_period] /= trips_denominator
    return demand_matrix

def populate_zone_attributes(city: City, zones: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    zone_population: dict[int, float] = {}
    zone_land: dict[int, dict[str, float]] = {}
    zone_pois: dict[int, int] = {}
    for _, zone in zones.iterrows():
        geom = zone['geometry']
        zone_id = zone['zone_id']
        try:
            pois = city.pois.clip(geom)
            landuse = city.landuse.clip(geom)
            buildings = city.buildings.clip(geom)
        except Exception:
            zone_population[zone_id] = 0
            zone_land[zone_id] = {x.value: 0 for x in Landuse}
            zone_pois[zone_id] = 0
            continue

        # determine the population of the zone based on the number of people living in buildings
        population = 0
        for _, building in buildings.iterrows():
            building_type = building['building']
            population += BUILDING_OCCUPANCY.get(building_type, 0)
        
        # determine the proportion of each landuse type by area in the zone
        area_by_type = {x.value: 0 for x in Landuse}
        for _, land in landuse.iterrows():
            land_area = land['geometry'].area
            land_type = land['landuse']
            area_by_type[land_type] += land_area
        total_area = zone['geometry'].area
        area_by_type = {k: v / total_area * 100.0 for k, v in area_by_type.items()}

        # determine the number of POIs in the zone
        pois_count = pois['amenity'].value_counts().sum()

        zone_population[zone_id] = population
        zone_land[zone_id] = area_by_type
        zone_pois[zone_id] = pois_count
        print('Zone', zone_id, 'population:', population)
    zones['population'] = zones['zone_id'].map(zone_population)
    zones['land'] = zones['zone_id'].map(zone_land)
    zones['pois'] = zones['zone_id'].map(zone_pois)
    return zones

def calculate_zone_attraction(zones: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    max_pois = zones['pois'].max()
    max_popn = zones['population'].max()
    # calculate attraction for each zone
    zone_attraction = {}
    for _, zone in zones.iterrows():
        zone_id = zone['zone_id']
        if 'pois' not in zone or 'land' not in zone or 'population' not in zone:
            zone_attraction[zone_id] = {time_period: 0 for time_period in TimePeriod}
            continue
        area_by_type = zone['land']
        popn = zone['population']
        pois = zone['pois']
        poi_score = pois / max_pois * 100.0
        pop_score = popn / max_popn * 100.0

        attraction_by_time = {}
        for time_period in TimePeriod:
            landuse_score = sum([
                area_by_type[land_type] * LAND_WEIGHTS[land_type][time_period]
                for land_type in area_by_type
            ])
            attraction_by_time[time_period] = (
                SCORE_POIS_WEIGHT * poi_score +
                SCORE_POPN_WEIGHT * pop_score +
                SCORE_LAND_WEIGHT * landuse_score
            )
        zone_attraction[zone_id] = attraction_by_time
    zones['attraction'] = zones['zone_id'].map(zone_attraction)
    return zones

def calculate_zone_production(zones: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    max_pois = zones['pois'].max()
    max_popn = zones['population'].max()
    zone_production = {}
    for _, zone in zones.iterrows():
        zone_id = zone['zone_id']
        zone_popn = zone['population']
        zone_pois = zone['pois']
        zone_production[zone_id] = {time_period: zone_popn / max_popn * 100.0 + zone_pois / max_pois * 100.0 for time_period in TimePeriod}
    zones['production'] = zones['zone_id'].map(zone_production)
    return zones

def normalize_zone_production_and_attraction(zones: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    # sum of all production should be equal to sum of all attraction
    for time_period in TimePeriod:
        ttl_production = zones['production'].apply(lambda x: x[time_period]).sum()
        ttl_attraction = zones['attraction'].apply(lambda x: x[time_period]).sum()
        trips_per_hour = TRIPS_GENERATED[time_period]
        zones['production'] = zones['production'].apply(lambda x: x.update({time_period: x[time_period] / ttl_production * trips_per_hour}) or x)
        zones['attraction'] = zones['attraction'].apply(lambda x: x.update({time_period: x[time_period] / ttl_attraction * trips_per_hour}) or x)
        # check the sum
        ttl_production = zones['production'].apply(lambda x: x[time_period]).sum()
        ttl_attraction = zones['attraction'].apply(lambda x: x[time_period]).sum()
        assert abs(ttl_production - ttl_attraction) < 1e-6
    return zones

def calculate_network_distance(city: City, zones: gpd.GeoDataFrame) -> list[list[float]]:
    graph = ox.graph_from_gdfs(city.nodes, city.edges)
    graph = ox.project_graph(graph)
    def h_haversine(u, v):
        R = 6378137
        u_lat, u_lon = radians(graph.nodes[u]['y']), radians(graph.nodes[u]['x'])
        v_lat, v_lon = radians(graph.nodes[v]['y']), radians(graph.nodes[v]['x'])
        dlat = v_lat - u_lat
        dlon = v_lon - u_lon
        a = sin(dlat / 2)**2 + cos(u_lat) * cos(v_lat) * sin(dlon / 2)**2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c
    distances = [[0 for _ in range(len(zones))] for _ in range(len(zones))]
    for i, zone1 in zones.iterrows():
        for j, zone2 in zones.iterrows():
            if i == j: continue
            if distances[i][j] != 0: continue
            geom1, geom2 = zone1['geometry'], zone2['geometry']
            node1 = ox.nearest_nodes(graph, geom1.centroid.x, geom1.centroid.y)
            node2 = ox.nearest_nodes(graph, geom2.centroid.x, geom2.centroid.y)
            dist_m = nx.astar_path_length(graph, node1, node2, heuristic=h_haversine, weight='length') 
            idx1, idx2 = zone1['zone_id'], zone2['zone_id']
            distances[idx1][idx2] = dist_m / 1000.0
            distances[idx2][idx1] = distances[idx1][idx2]
            print(f"  Distance between zones {idx1} and {idx2} is {distances[idx1][idx2]} km")
    return distances

def calculate_zone_distance(zones: gpd.GeoDataFrame) -> list[list[float]]:
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
            if i == j: continue
            if distances[i][j] != 0: continue
            geom1, geom2 = zone1['geometry'], zone2['geometry']
            idx1, idx2 = zone1['zone_id'], zone2['zone_id']
            coord1 = geom1.centroid.y, geom1.centroid.x
            coord2 = geom2.centroid.y, geom2.centroid.x
            distances[idx1][idx2] = haversine(coord1, coord2)
            distances[idx2][idx1] = distances[idx1][idx2]
            print(f"  Distance between zones {idx1} and {idx2} is {distances[idx1][idx2]} km")
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

def load_data_from_files(file_path: str, nodes_file, edges_file) -> City:
    osm = po.OSM(file_path)
    nodes = gpd.read_file(nodes_file)
    edges = gpd.read_file(edges_file)
    edges.set_index(['u', 'v', 'key'], inplace=True)
    nodes.set_index('osmid', inplace=True)
    pois = osm.get_pois(custom_filter={'amenity': True})
    landuse = osm.get_landuse(custom_filter={'landuse': [x.value for x in Landuse]})
    buildings = osm.get_buildings(custom_filter={'building': [x.value for x in Building]})
    return City(
        nodes=nodes,
        edges=edges,
        pois=pois,
        landuse=landuse,
        buildings=buildings,
    )

def load_db(
    conn: sqlite3.Connection,
    zones: gpd.GeoDataFrame,
    distances: list[list[float]],
    demand_matrix: list[list[dict[TimePeriod, float]]],
):
    conn.execute('DELETE FROM zone;')
    conn.execute('DELETE FROM demand;')
    conn.executemany('INSERT INTO zone VALUES (?, ?, ?)', [
        (idx, geom[0].centroid.wkt, geom[0].wkt)
        for idx, geom in zones[['geometry']].iterrows()
    ])
    conn.executemany('INSERT INTO demand VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        (
            idx1, 
            idx2, 
            distances[idx1][idx2], 
            max(demand_matrix[idx1][idx2].values()), 
            demand_matrix[idx1][idx2][TimePeriod.MORNING],
            demand_matrix[idx1][idx2][TimePeriod.AM_RUSH],
            demand_matrix[idx1][idx2][TimePeriod.MID_DAY],
            demand_matrix[idx1][idx2][TimePeriod.PM_RUSH],
            demand_matrix[idx1][idx2][TimePeriod.NIGHT],
        )
        for idx1, _ in zones.iterrows()
        for idx2, _ in zones.iterrows()
    ])
    conn.commit()

def run_gravity_model(
    city_file: str,
    nodes_file: str,
    edges_file: str,
    num_rows: int,
    num_cols: int,
    conn: sqlite3.Connection,
):
    import time

    print("Loading city data...")
    start = time.time()
    city = load_data_from_files(
        city_file,
        nodes_file,
        edges_file,
    )
    print(f"Data loaded in {time.time() - start:.2f} seconds")

    print("Dividing city into zones...")
    zones = divide_into_zones(city, num_rows, num_cols)

    print("Populating zone attributes...")
    start = time.time()
    zones = populate_zone_attributes(city, zones)
    print(f"Zone attributes populated in {time.time() - start:.2f} seconds")

    print("Calculating zone attraction...")
    start = time.time()
    zones = calculate_zone_attraction(zones)
    print(f"Zone attraction calculated in {time.time() - start:.2f} seconds")

    print("Calculating zone production...")
    start = time.time()
    zones = calculate_zone_production(zones)
    print(f"Zone production calculated in {time.time() - start:.2f} seconds")

    print("Normalizing zone production and attraction...")
    start = time.time()
    zones = normalize_zone_production_and_attraction(zones)
    print(f"Zone production and attraction normalized in {time.time() - start:.2f} seconds")

    print("Calculating zone distances...")
    start = time.time()
    distances = calculate_zone_distance(zones)
    print(f"Zone distances calculated in {time.time() - start:.2f} seconds")

    print("Running gravity model...")
    start = time.time()
    demand_matrix = gravity_model_demand_matrix(zones, distances)
    print(f"Gravity model ran in {time.time() - start:.2f} seconds")

    print("Loading data into database...")
    load_db(conn, zones, distances, demand_matrix)

    print("Done!")

def main():
    conn = sqlite3.connect('city_db/toronto2.db')
    conn.enable_load_extension(True)
    conn.load_extension('mod_spatialite')
    run_gravity_model(
        'city_data/toronto/data/Toronto.osm.pbf',
        'city_data/toronto/data/nodes.gpkg',
        'city_data/toronto/data/edges.gpkg',
        20,
        20,
        conn,
    )

if __name__ == '__main__':
    main()
