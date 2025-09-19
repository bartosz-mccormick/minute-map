prepareGTFS <- function(input_path, output_path = "./r5r_model/gtfs.zip", area){
  
  gtfs_raw <- read_gtfs(input_path,encoding = "UTF-8") 
  
  area <- st_transform(area,crs = 4326) #ensure WGS84 for filtering the GTFS feed
  
  gtfs_filtered <- filter_feed_by_area(gtfs_raw,st_bbox(area))
  
  write_gtfs(gtfs_filtered,output_path)
  

}





