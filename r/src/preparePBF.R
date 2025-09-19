# requires osmosis! 
prepareTrimmedPbf <- function(input_path,output_dir = "./r5r_model/",planning_area,projected_crs){
  
  GEO_CRS = 4326
  ADDITIONAL_BUFFER = 5000 # tolerance so that completeways and complete relations executes correctly (osmosis)
  
  planning_area_bbox <- planning_area%>%
    st_transform(crs = GEO_CRS)%>%
    st_bbox()
  
  buffered_bbox <- planning_area%>%
    st_transform(crs = projected_crs)%>%
    st_buffer(ADDITIONAL_BUFFER)%>%
    st_transform(crs = GEO_CRS)%>%
    st_bbox()
  
  osmosis_bbox <- list(step1 = planning_area_bbox,
                       step2 = buffered_bbox)
  
  buf_file_name = paste0(output_dir,"/intermediate.osm.pbf")
  file_name = paste0(output_dir,"/prepared.osm.pbf")
  

  
  osmosis_commands <-
    names(osmosis_bbox)%>%
    set_names(.)%>%
    lapply(function(stepName){
      paste("osmosis --read-pbf",
            ifelse(stepName == "step1",
                   input_path ,
                   buf_file_name),
            "--bounding-box",
            paste0("top=", osmosis_bbox[[stepName]]$ymax),
            paste0("left=", osmosis_bbox[[stepName]]$xmin),
            paste0("bottom=", osmosis_bbox[[stepName]]$ymin),
            paste0("right=", osmosis_bbox[[stepName]]$xmax),
            ifelse(stepName == "step1",
                   paste0(""),
                   paste0(" completeWays=yes completeRelations=yes")),
            "--write-pbf",
            ifelse(stepName == "step1",
                   buf_file_name,
                   file_name),
            sep =" ")
      
    })
  
  
  
  # execute osmosis commands
  osmosis_commands%>%
    lapply(system)
  # remove intermediate buffered pbf
  file.remove(buf_file_name)
  
}







