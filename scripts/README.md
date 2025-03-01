# Scripts

A collection of utility scripts to do things like setting up dev environments and populate dbs.

- [Scripts](#scripts)
  - [populate\_db.py](#populate_dbpy)
    - [Prerequisites](#prerequisites)
    - [Running](#running)
  - [gravity\_model.py](#gravity_modelpy)

## populate_db.py

Populates a spatialite database with geospatial data for a the street network of a given city. Running this script is a prerequisite for using `route-service`.

### Prerequisites
- Sqlite3
```
brew install sqlite
```
- Spatialite
```
brew install libspatialite
```

### Running

Python 3.12 is required.

Install if you have homebrew:
```
brew install python@3.12
```

Setup venv
```
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Run the script
```
python populate_db.py toronto
```

## gravity_model.py

Travel demand model for a city. This module is used by populate_db to determine the grid to grid travel demand.

It is best to experiment with this file in a repl session to interactively test the geodataframes.

```
import gravity_model as gm
city_file = 'city_data/toronto/data/Toronto.osm.pbf'
nodes_file = 'city_data/toronto/data/nodes.gpkg'
edges_file = 'city_data/toronto/data/edges.gpkg'
num_rows, num_cols = 20, 20
city = gm.load_data_from_files(city_file,nodes_file,edges_file)
zones = gm.divide_into_zones(city, num_rows, num_cols)
zones = gm.populate_zone_attributes(city, zones)
zones = gm.calculate_zone_attraction(zones)
zones = gm.calculate_zone_production(zones)
zones = gm.normalize_zone_production_and_attraction(zones)
distances = gm.calculate_zone_distance(zones)
demand_matrix = gm.gravity_model_demand_matrix(zones, distances)
gm.visualize_demand(city, zones, demand_matrix, gm.TimePeriod.AM_RUSH, output_file=f'city_data/demand_visualization_{num_rows}x{num_cols}.png')
```
