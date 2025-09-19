options(java.parameters = "-Xmx32G") #"Always set the memory limit before loading the library, or that setting will have no effect." https://github.com/ipeaGIT/r5r/issues/170#issuecomment-842369304
library(r5r)
library(tidyverse)
library(sf)
library(tidytransit)
library(DBI)
library(dotenv)
list.files("./src",full.names = T)%>%sapply(source)


# CONFIG
MODE_CONFIGS <- 
  list(
    walk = list(
      mode = "WALK",
      mode_egress = "WALK",
      departure_datetime = as.POSIXct("15-09-2008 12:00:00", format = "%d-%m-%Y %H:%M:%S"),
      time_window = 1L,
      percentiles = 50L,
      fare_structure = NULL,
      max_fare = Inf,
      max_walk_time = 30,
      max_bike_time = 30,
      max_trip_duration = 30,
      walk_speed = 4,
      bike_speed = 12,
      max_rides = 3,
      max_lts = 2
      
    )
  )

PROJECTED_CRS = 3050

PBF_PATH <- list.files("./input_data/",pattern = "*.pbf",full.names = T)
RAW_GTFS_PATH <- list.files("./input_data/",pattern = "*.zip",full.names = T)

# END CONFIG

load_dot_env()


con_poi <- dbConnect(RPostgres::Postgres(),
                 dbname = Sys.getenv("POSTGRES_DB_POI"), 
                 host = Sys.getenv("PGHOST_POI"), 
                 port = Sys.getenv("PGPORT_POI"), 
                 user = Sys.getenv("POSTGRES_USER_POI"),
                 password = Sys.getenv("POSTGRES_PASSWORD_POI"))

con_accessibility <- dbConnect(RPostgres::Postgres(),
                     dbname = Sys.getenv("POSTGRES_DB_ACCESSIBILITY"), 
                     host = Sys.getenv("PGHOST_ACCESSIBILITY"), 
                     port = Sys.getenv("PGPORT_ACCESSIBILITY"), 
                     user = Sys.getenv("POSTGRES_USER_ACCESSIBILITY"),
                     password = Sys.getenv("POSTGRES_PASSWORD_ACCESSIBILITY"))

admin_area = st_read(con_poi, query = paste0("
    SELECT *
    FROM admin.admin_areas;"
))  


planning_area = st_read(con_poi, query = paste0("
    SELECT *
    FROM admin.planning_area;"
))  



grid <- st_read(con_poi, query = paste0("
    SELECT *
    FROM admin.grid;"
))  

# get amenities and entrances
amenities <- st_read(con_poi, query = paste0("
    SELECT *
    FROM model.amenities;"
)) 

entrances <- st_read(con_poi, query = paste0("
    SELECT *
    FROM model.entrances;"
)) 

# get classification scheme
classes <- st_read(con_poi, query = paste0("
    SELECT *
    FROM staging.class_b_config;"
))%>%
  as_tibble()
  



# prepare pbf file (requires OSMOSIS)
## TODO if osmosis is not installed, copy over the raw pbf and send a warning
prepareTrimmedPbf(input_path = PBF_PATH,
                  output_dir = "./r5r_model/",
                  planning_area = planning_area,
                  projected_crs = PROJECTED_CRS)
  

# prepare GTFS files
prepareGTFS(input_path  =  RAW_GTFS_PATH,
            output_path  = "./r5r_model/gtfs.zip" ,
            area = planning_area)





entrances_to_join <- entrances%>%
  select(h3_cell,parent_osm_id)%>%
  st_drop_geometry()%>%
  as_tibble()%>%
  rename(osm_id = "parent_osm_id")%>%
  left_join(amenities%>%st_drop_geometry()%>%select(class_a,osm_id), by = "osm_id")%>%
  left_join(classes,by = "class_a")

amenities%>%st_drop_geometry()%>%as_tibble()%>%select(class_a,osm_id)


dbRemoveTable(con_accessibility,Id(schema = "api_data", table = "grid_access"),fail_if_missing = F)

dbExecute(con_accessibility, "
  CREATE TABLE api_data.grid_access (
    h3_cell      text,
    travel_time  integer,
    class_b      text,
    n            integer,
    mode_config text,
    PRIMARY KEY (mode_config,class_b,travel_time ,h3_cell)

  );
")


for (mode_config_name in names(MODE_CONFIGS)){
  ttm <- calculateTTM(grid%>%filter(!is.na(admin_name)), # cells within admin area
                      grid%>%filter(h3_cell %in% (entrances$h3_cell%>%unique())), # cells with at least 1 entrance
                      Os_id = "h3_cell",
                      Ds_id = "h3_cell",
                      config = MODE_CONFIGS[[mode_config_name]],
                      overwrite = T)
  
  # join entrances to ttm
  grid_access<-
    ttm%>%
    left_join(entrances_to_join%>%
                rename(to_id = "h3_cell"),
              by = "to_id", multiple = "all",relationship = "many-to-many")%>%
    filter(!is.na(osm_id))%>% # remove destinations without an entrance
    group_by(from_id, osm_id)%>%
    slice_min(travel_time,with_ties = F)%>% #if multiple entrances to the same destination (osm_id) can be reached, keep the one with the minimal travel time (IMPORTANT!)
    ungroup()%>%
    count(from_id,travel_time,class_b)%>%
    mutate(mode_config = mode_config_name)%>%
    rename(h3_cell = "from_id")
  
      
  # update table in DB
  dbWriteTable(
    con_accessibility,
    Id(schema = "api_data", table = "grid_access"),
    grid_access,
    append = TRUE,
    row.names = FALSE
  )
  
  
  rm(ttm)
  rm(grid_access)
  
}



dbDisconnect(con_accessibility)







  
  