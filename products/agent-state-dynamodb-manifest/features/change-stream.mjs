export const feature = {id:'change-stream',apply({input,checks}) {
  input.StreamSpecification={StreamEnabled:true,StreamViewType:'NEW_AND_OLD_IMAGES'};
  checks['Table.StreamSpecification']={StreamEnabled:true,StreamViewType:'NEW_AND_OLD_IMAGES'};
}};
