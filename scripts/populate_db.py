import os
import csv
import shutil
import sqlite3
import zipfile
import argparse
import requests
import subprocess

TEMPLATE_DB = 'template.db'
SCHEMA_FILE = 'schema.sql'

CACHE_DIR = 'city_data'
CITY_DIR = 'city_db'

def setup_files():
    # Setup template database
    if os.path.exists(TEMPLATE_DB):
        os.remove(TEMPLATE_DB)
    with open(SCHEMA_FILE, 'r') as schema:
        subprocess.run(['sqlite3', TEMPLATE_DB], stdin=schema)

    # Create directories
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(CITY_DIR, exist_ok=True)

    # Setup city directories and database
    for city in CITY_MAP.values():
        if not os.path.exists(city.db_path):
            shutil.copyfile(TEMPLATE_DB, city.db_path)
        os.makedirs(city.data_dir, exist_ok=True)
        os.makedirs(city.gmns_dir, exist_ok=True)
        os.makedirs(city.gtfs_dir, exist_ok=True)
        os.makedirs(city.g2d_dir, exist_ok=True)

class City:
    key_name: str
    osm_name: str
    gtfs_src: str
    data_dir: str
    gmns_dir: str
    db_path: str

    def __init__(
        self,
        key_name: str,
        osm_name: str,
        gtfs_src: str,
    ):
        self.key_name = key_name
        self.osm_name = osm_name
        self.gtfs_src = gtfs_src
        self.data_dir = f'{CACHE_DIR}/{key_name}/data'
        self.gmns_dir = f'{CACHE_DIR}/{key_name}/gmns'
        self.gtfs_dir = f'{CACHE_DIR}/{key_name}/gtfs'
        self.g2d_dir = f'{CACHE_DIR}/{key_name}/g2d'
        self.db_path = f'{CITY_DIR}/{key_name}.db'
    
    @property
    def city_file(self):
        try:
            file = next(f for f in os.listdir(self.data_dir) if f.endswith('.osm.pbf'))
            file = f'{self.data_dir}/{file}'
            return file
        except:
            return f'{self.data_dir}/{self.key_name}.osm.pbf'

    @property
    def nodes_file(self):
        return f'{self.data_dir}/nodes.gpkg'

    @property
    def edges_file(self):
        return f'{self.data_dir}/edges.gpkg'

CITY_MAP = {
    'toronto': City(
        key_name='toronto',
        osm_name='Toronto, ON, Canada', 
        gtfs_src='http://opendata.toronto.ca/toronto.transit.commission/ttc-routes-and-schedules/OpenData_TTC_Schedules.zip'
    )
}

def load_libspatialite(conn: sqlite3.Connection, init: bool = True):
    print('Loading libspatialite')
    conn.enable_load_extension(True)
    conn.load_extension('mod_spatialite')
    if init: conn.execute('SELECT InitSpatialMetadata(1);')

def get_data_from_OSM(city: City):
    import osmnx as ox
    import pyrosm as po
    # Get nodes.gpkg and edges.gpkg
    if not os.path.exists(city.nodes_file) or not os.path.exists(city.edges_file):
        # Download the drive network
        print('Downloading OSM road network data')
        graph = ox.graph_from_place(city.osm_name, network_type='drive', simplify=False)
        # Extract the nodes and edges files
        print('Extracting GPKG data')
        nodes, edges = ox.graph_to_gdfs(graph)
        nodes.to_file(city.nodes_file, driver='GPKG')
        edges.to_file(city.edges_file, driver='GPKG')

    # Download the .osm.pbf file from pyrosm
    if not os.path.exists(city.city_file):
        print('Getting .osm.pbf from pyrosm')
        _ = po.get_data(city.key_name, directory=city.data_dir)

def add_nodes_edges_osmnx(
    city: City,
    conn: sqlite3.Connection,
):
    import pandas as pd

    print('Loading OSM road network data to database')
    nodes_file = f'{city.data_dir}/nodes.gpkg'
    edges_file = f'{city.data_dir}/edges.gpkg'

    # Clear the nodes and edges tables
    conn.execute('DELETE FROM nodes;')
    conn.execute('DELETE FROM edges;')

    print('Reading nodes...')
    with sqlite3.connect(nodes_file) as nodes_conn:
        load_libspatialite(nodes_conn, init=False)
        nodes_conn.execute('SELECT EnableGpkgMode();')
        nodes_df = pd.read_sql('SELECT fid, ST_AsText(geom) as geom, osmid, y, x FROM nodes', nodes_conn)

    print('Reading edges...')
    with sqlite3.connect(edges_file) as edges_conn:
        load_libspatialite(edges_conn, init=False)
        edges_conn.execute('SELECT EnableGpkgMode();')
        edges_df = pd.read_sql('SELECT fid, ST_AsText(geom) as geom, u, v, key, osmid FROM edges', edges_conn)

    print('Inserting rows')
    nodes_df[['fid', 'geom', 'osmid', 'y', 'x']].to_sql('nodes', conn, if_exists='replace', index=False)
    edges_df[['fid', 'geom', 'u', 'v', 'key', 'osmid']].to_sql('edges', conn, if_exists='replace', index=False)

    conn.commit()

def add_travel_demand_grid2demand(
    city: City,
    conn: sqlite3.Connection,
):
    import pandas as pd
    import osm2gmns as og
    import grid2demand as gd

    # takes like 30 minutes
    if not os.path.exists(f'{city.gmns_dir}/node.csv') or not os.path.exists(f'{city.gmns_dir}/poi.csv'):
        print('Converting to GMNS')
        net = og.getNetFromFile(city.city_file, network_types=('auto',), POI=True, POI_sampling_ratio=0.1)
        og.outputNetToCSV(net, output_folder=city.gmns_dir)

    # grid2demand
    print('Getting demand matrix')
    net = gd.GRID2DEMAND(input_dir=city.gmns_dir, output_dir=city.g2d_dir)
    net.load_network() # expects node.csv and poi.csv
    net.net2zone(cell_width=1, cell_height=1, unit='km')
    net.run_gravity_model()
    net.save_results_to_csv(output_dir=city.g2d_dir) # outputs zone.csv and demand.csv

    # load dataframe
    print('Loading dataframe')
    zone = pd.read_csv(f'{city.g2d_dir}/zone.csv')
    demand = pd.read_csv(f'{city.g2d_dir}/demand.csv')

    print('Renaming columns')
    zone.rename(columns={'zone_id': 'zoneid', 'centroid': 'center', 'geometry': 'geom'}, inplace=True)
    demand.rename(columns={'o_zone_id': 'origid', 'd_zone_id': 'destid'}, inplace=True)

    print('Inserting rows')
    zone[['zoneid', 'center', 'geom']].to_sql('zone', conn, if_exists='replace', index=False)
    demand[['origid', 'destid', 'dist_km', 'volume']].to_sql('demand', conn, if_exists='replace', index=False)

def add_travel_demand_gravity_model(
    city: City,
    conn: sqlite3.Connection,
):
    from gravity_model import run_gravity_model
    run_gravity_model(
        city_file=city.city_file,
        nodes_file=city.nodes_file,
        edges_file=city.edges_file,
        num_rows=20,
        num_cols=20,
        conn=conn,
    )

def add_gtfs_data(
    city: City,
    conn: sqlite3.Connection,
):
    print(f'Downloading GTFS data from {city.gtfs_src}')
    response = requests.get(city.gtfs_src)
    response.raise_for_status()

    file_name = city.gtfs_src.split('/')[-1]
    file_name = f'{city.gtfs_dir}/{file_name}'
    print(f'Extracting GTFS data into {file_name}')
    with open(file_name, 'wb') as f:
        f.write(response.content)
    
    with zipfile.ZipFile(file_name, 'r') as zip_ref:
        zip_ref.extractall(path=city.gtfs_dir)

    # TODO Handle if a table is missing or already filled
    print('Loading GTFS files to database')
    cursor = conn.cursor()
    # copy all the .txt files in the extracted folder to the database
    for file in os.listdir(path=city.gtfs_dir):
        if file.endswith('.txt'):
            file_path = f'{city.gtfs_dir}/{file}'
            print(f'Loading {file_path} to database')
            with open(file_path, 'r') as f:
                reader = csv.reader(f)
                columns = next(reader)
                table_name = f'gtfs_{file.split(".")[0]}'
                # Insert all the data from the file
                cursor.executemany(f"INSERT INTO {table_name} VALUES ({','.join(['?'] * len(columns))})", reader)

    conn.commit()

def main():
    parser = argparse.ArgumentParser(description='Populate a database with city data')
    parser.add_argument('city', choices=CITY_MAP.keys(), help='City to populate')
    args = parser.parse_args()

    print('Setting up files')
    setup_files()

    city = CITY_MAP[args.city]
    conn = sqlite3.connect(city.db_path)
    load_libspatialite(conn)

    print('1/4: GETTING DATA FROM OSM')
    get_data_from_OSM(city)
    print('2/4: ADDING NODES AND EDGES')
    add_nodes_edges_osmnx(city, conn)
    print('3/4: ADDING TRAVEL DEMAND')
    add_travel_demand_gravity_model(city, conn)
    print('4/4: ADDING GTFS DATA')
    add_gtfs_data(city, conn)

    conn.close()

if __name__ == '__main__':
    main()
