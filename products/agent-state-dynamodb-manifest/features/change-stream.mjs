export const feature={id:'change-stream',apply({input,verification}) {
  input.StreamSpecification={StreamEnabled:true,StreamViewType:'NEW_AND_OLD_IMAGES'};
  verification[0].checks['Table.StreamSpecification.StreamEnabled']=true;
  verification[0].checks['Table.StreamSpecification.StreamViewType']='NEW_AND_OLD_IMAGES';
}};
