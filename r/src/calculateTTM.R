calculateTTM <- function(Os,
                         Ds,
                         Os_id = "id",
                         Ds_id = "id",
                         config = list(
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
                           
                         ),
                         overwrite = FALSE) {
  
  
  r5r_core <- setup_r5(data_path = "./r5r_model",
                       verbose = FALSE,
                       overwrite = overwrite)
  
  O_points <-
    Os%>%
    st_transform(crs = 4326)%>%
    st_coordinates() %>%
    as_tibble() %>%
    mutate(id = Os[[Os_id]]) %>%
    rename(lon = "X", lat = "Y")
  
  
  D_points <-
    Ds%>%
    st_transform(crs = 4326)%>%
    st_coordinates() %>%
    as_tibble() %>%
    mutate(id = Ds[[Ds_id]]) %>%
    rename(lon = "X", lat = "Y")
  
  
  
  
  ttm <- travel_time_matrix(
    r5r_core          = r5r_core,
    origins           = O_points,
    destinations      = D_points,
    mode              = config$mode,
    mode_egress       = config$mode_egress,
    departure_datetime = config$departure_datetime,
    time_window       = config$time_window,
    percentiles       = config$percentiles,
    fare_structure    = config$fare_structure,
    max_fare          = config$max_fare,
    max_walk_time     = config$max_walk_time,
    max_bike_time     = config$max_bike_time,
    max_trip_duration = config$max_trip_duration,
    walk_speed        = config$walk_speed,
    bike_speed        = config$bike_speed,
    max_rides         = config$max_rides,
    max_lts           = config$max_lts,
    draws_per_minute  = 5L,
    n_threads         = Inf,
    verbose           = FALSE,
    progress          = FALSE
  )
  
  # remove tt from origin to itself, reintroduce as 0
  ttm <- ttm %>% filter(from_id != to_id)
  
  ttm <- ttm %>%
    bind_rows(
      tibble(
        from_id = ttm$to_id %>% unique(),
        to_id = ttm$to_id %>% unique(),
        travel_time_p50 = 0
      )
    )
  
  ttm <- ttm%>%
    rename(travel_time = "travel_time_p50")
  
  
  #clean up r5r memory usage
  stop_r5(r5r_core)
  rJava::.jgc(R.gc = TRUE)
  
  return(ttm)
  
}

    
  
  

  














