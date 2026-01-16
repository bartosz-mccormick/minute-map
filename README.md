# Set up:

## POI database -  [dreams-accessibility-postgis](https://github.com/bartosz-mccormick/dreams-accessibility-postgis)
- clone the repository
- replace `data/admin.gpkg` with the administrative boundaries of the city (`name` field is required, it can contain a single polygon of the boundary or neighborhoods) 
- save a copy of `.env.example` as `.env`
  - set `PBF_URL` to a `.pbf` extract of OSM data that will be downloaded to extract POIs (e.g., from [Geofabrik](https://download.geofabrik.de/): `PBF_URL=https://download.geofabrik.de/europe/germany/bayern/oberbayern-latest.osm.pbf`)
  - set `POP_URL` to a `.tif` of population estimates from [WorldPop](https://data.worldpop.org/GIS/Population/) (e.g., `POP_URL=https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2025/DEU/v1/100m/constrained/deu_pop_2025_CN_100m_R2025A_v1.tif`)
  - set `TARGET_SRID` to a projected CRS that covers the city
  - (OPTIONAL) set `ADMIN_BUFFER` to the distance (meters) `admin.gpkg` should be buffered to keep POIs 
  - (OPTIONAL) set `DEFAULT_POINT_IF_SMALL_AREA`  to the area (m^2) for coverting smaller polygons to points when "point_if_small" polyon policy is set 
- create  `class_a_config.csv` by copying a template from `/sql/templates/`.
  - `class_a` is the name of the most detailed POI representation in the database
  - `sql` provides the definition through:
    - in-line sql
    - (path to) dedicated sql file (leaving blank will look for corresponding file in `/sql/class_a_defs/default`)
  - `polygon_policy` specifies how to process polygon objects:
    - "area": keep polygon geometries as-is (default)
    - "point_all": convert all polygons to points
    - "point_if_small" : convert polygons smaller than threshold to points (1000m^2 or `min_area_m2`)    
- create `class_b_config.csv` by copying a template from `/sql/templates/` . These aggregate class_a POIs into functionally equivalent groups.
- run all docker services (this will run the importer and initialize the database)
- run `post_import/execute_main.sh`
- run `post_import/pop_raster_import.sh`

## BACKEND DB & API -  [dreams-accessibility-postgis](https://github.com/bartosz-mccormick/dreams-xmin-city-accessibility-tool-backend)
### INITIALIZE
- clone repository
- save a copy of `.env.example` as `.env`

### ACCESSIBILITY CALCULATIONS
- add a GTFS file to `/r-scripts/input_data` (will be trimmed to study area)
- add a `.pbf` extract of OSM data to `/r-scripts/input_data` (can be moved from `/dreams-accessibility-postgis/data/`) (will be trimmed to study area)
- save a copy of `/r-scripts/.env.example` as `/r-scripts/.env`
  - set `TARGET_SRID` to a projected CRS that covers the city
- run `main.R` with `/r-scripts/` as the working directory

### ACCESSIBILITY CALCULATIONS


