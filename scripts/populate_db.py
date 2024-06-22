import osmnx as ox
import sqlite3
import os
import shutil

nodes_file = 'nodes.gpkg'
edges_file = 'edges.gpkg'
template_db = 'template.db'

def download_gpkg(place):
    if os.path.exists(nodes_file):
        return

    G = ox.graph_from_place(place, network_type='drive', simplify=False)
    nodes, edges = ox.graph_to_gdfs(G)
    nodes.to_file(nodes_file, driver='GPKG')
    edges.to_file(edges_file, driver='GPKG')

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

    conn.commit()
    conn.close()

def load_gpkg_to_sqlite(city_name):
    city_db = f'{city_name}.db'
    if os.path.exists(city_db):
        return

    shutil.copyfile(template_db, city_db)

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

download_gpkg('Toronto, ON, Canada')
setup_template_db()
load_gpkg_to_sqlite('toronto')
