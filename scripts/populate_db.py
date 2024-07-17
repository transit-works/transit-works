import sqlite3
import os
import shutil
import tempfile
import argparse
import pandas as pd
import osmnx as ox
import grid2demand as gd
import osm2gmns as og

template_db = 'template.db'

def setup_template_db():
    if os.path.exists(template_db):
        return

    conn = sqlite3.connect(template_db)
    conn.enable_load_extension(True)
    conn.execute('SELECT load_extension("mod_spatialite");')
    conn.execute('SELECT InitSpatialMetaData(1);')

    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE nodes (
        fid INTEGER PRIMARY KEY,
        geom POINT,
        osmid INTEGER,
        y REAL,
        x REAL
    );
    ''')

    cursor.execute('''
    CREATE TABLE edges (
        fid INTEGER PRIMARY KEY,
        geom LINESTRING,
        u INTEGER,
        v INTEGER,
        key INTEGER,
        osmid INTEGER
    );
    ''')

    cursor.execute('''
    CREATE TABLE zone (
        zoneid INTEGER PRIMARY KEY,
        center POINT,
        geom POLYGON
    );
    ''')

    cursor.execute('''
    CREATE TABLE demand (
        origid INTEGER,
        destid INTEGER,
        dist_km REAL,
        volume REAL,
        FOREIGN KEY(origid) REFERENCES zone(zoneid),
        FOREIGN KEY(destid) REFERENCES zone(zoneid)
    );
    ''')

    conn.commit()
    conn.close()

def add_nodes_edges_osmnx(osm_city_name, db_name_prefix):
    nodes_file = 'nodes.gpkg'
    edges_file = 'edges.gpkg'

    def download_gpkg():
        graph = ox.graph_from_place(osm_city_name, network_type='drive', simplify=False)
        nodes, edges = ox.graph_to_gdfs(graph)
        nodes.to_file(nodes_file, driver='GPKG')
        edges.to_file(edges_file, driver='GPKG')

    def load_gpkg_to_sqlite():
        city_db = f'{db_name_prefix}.db'

        print('Obtaining connection to sqlite')
        conn = sqlite3.connect(city_db)
        conn.enable_load_extension(True)

        # Load SpatiaLite extension
        print('Loading libspatialite')
        conn.execute('SELECT load_extension("mod_spatialite");')

        cursor = conn.cursor()

        cursor.execute(f'ATTACH DATABASE "{nodes_file}" as nodes_db')
        cursor.execute('''
        INSERT INTO nodes (fid, geom, osmid, y, x)
        SELECT fid, geom, osmid, y, x FROM nodes_db.nodes;
        ''')

        cursor.execute(f'ATTACH DATABASE "{edges_file}" as edges_db')
        cursor.execute('''
        INSERT INTO edges (fid, geom, u, v, key, osmid)
        SELECT fid, geom, u, v, key, osmid FROM edges_db.edges;
        ''')

        conn.commit()
        cursor.execute('DETACH DATABASE nodes_db')
        cursor.execute('DETACH DATABASE edges_db')
        conn.close()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        os.chdir(tmpdir)
        download_gpkg()
        load_gpkg_to_sqlite()

def add_travel_demand_grid2demand(osm_city_name, db_name_prefix):
    with tempfile.TemporaryDirectory() as tmpdir:
        os.chdir(tmpdir)

        ox.settings.all_oneway=True
        ox.settings.log_console = True

        # download osm file
        print('Downloading OSM file')
        graph = ox.graph_from_place(osm_city_name, network_type='drive', simplify=False)
        ox.save_graph_xml(graph, 'map.osm')

        # download all POIs
        print('Downloading POIs')
        tags = {'amenities': True, 'building': True}
        gdf = ox.features_from_place(osm_city_name, tags=tags)
        gdf.to_csv('poi.csv')

        # convert to gmns
        print('Converting to GMNS')
        net = og.getNetFromFile('map.osm')
        og.outputNetToCSV(net)

        # grid2demand
        print('Getting demand matrix')
        net = gd.GRID2DEMAND()
        net.load_network() # expects node.csv and poi.csv
        net.net2zone(cell_width=10, cell_height=10, unit='km')
        net.run_gravity_model()
        net.save_results_to_csv(output_dir=tmpdir) # outputs zone.csv and demand.csv

        # load dataframe
        print('Loading dataframe')
        zone = pd.read_csv('zone.csv')
        demand = pd.read_csv('demand.csv')

        # put dataframe in sqlite
        print('Connecting to database')
        city_db = f'{db_name_prefix}.db'

        conn = sqlite3.connect(city_db)
        conn.enable_load_extension(True)
        conn.execute('SELECT load_extension("mod_spatialite");')

        print('Renaming columns')
        zone.rename(columns={'zone_id': 'zoneid', 'centroid': 'center', 'geometry': 'geom'}, inplace=True)
        demand.rename(columns={'o_zone_id': 'origid', 'd_zone_id': 'destid'}, inplace=True)

        print('Inserting rows')
        zone[['zoneid', 'center', 'geom']].to_sql('zone', conn, if_exists='append', index=False)
        demand[['origid', 'destid', 'dist_km', 'volume']].to_sql('demand', conn, if_exists='append', index=False)

        conn.close()

def main():
    setup_template_db()

    osm_city_name = 'Toronto, ON, Canada'
    db_name_prefix = 'toronto'

    if not os.path.exists(f'{db_name_prefix}.db'):
        shutil.copyfile(template_db, f'{db_name_prefix}.db')

    cwd = os.getcwd()
    db_name_prefix = f'{cwd}/{db_name_prefix}'

    add_nodes_edges_osmnx(osm_city_name, db_name_prefix)
    add_travel_demand_grid2demand(osm_city_name, db_name_prefix)

if __name__ == '__main__':
    main()
