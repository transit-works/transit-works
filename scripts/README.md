# Scripts

A collection of utility scripts to do things like setting up dev environments and populate dbs.

1. [populate_db.py](#populate_db.py)

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

### Required pip modules
- osmnx
- grid2demand
- osm2gmns
- pandas
- pyrosm

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
