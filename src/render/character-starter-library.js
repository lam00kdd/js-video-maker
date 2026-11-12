export const starterCharacterProfiles=Object.freeze([
  Object.freeze({id:'engineer',label:'Kỹ sư',role:'engineer',rig_profile:'adult',motion_style:'natural',skin_tone:'warm_medium',hair_style:'short_neat',face_style:'friendly_glasses',outfit:'lam_engineer_uniform'}),
  Object.freeze({id:'teacher',label:'Giáo viên',role:'male_teacher',rig_profile:'adult',motion_style:'natural',skin_tone:'warm_medium',hair_style:'short_neat',face_style:'friendly',outfit:'teacher_smart_casual'}),
  Object.freeze({id:'student',label:'Học sinh',role:'student',rig_profile:'student',motion_style:'natural',skin_tone:'light_warm',hair_style:'short_neat',face_style:'youthful_friendly',outfit:'school_uniform'}),
  Object.freeze({id:'electrician',label:'Thợ điện',role:'electrician',rig_profile:'adult',motion_style:'natural',skin_tone:'tan',hair_style:'short_neat',face_style:'friendly',outfit:'electrician_safety_uniform'}),
  Object.freeze({id:'robot',label:'Robot hình người',role:'humanoid_robot',rig_profile:'humanoid_robot',motion_style:'robotic',skin_tone:'brushed_silver',hair_style:'none',face_style:'led_face',outfit:'robot_shell'})
]);
export const starterAppearanceOptions=Object.freeze({
  skin_tone:Object.freeze([['light_warm','Sáng ấm'],['warm_medium','Trung bình ấm'],['tan','Nâu rám nắng'],['deep_brown','Nâu đậm'],['brushed_silver','Bạc kim loại']]),
  hair_style:Object.freeze([['short_neat','Ngắn gọn'],['medium_side_part','Ngang vừa, rẽ ngôi'],['long_straight','Dài thẳng'],['curly','Xoăn'],['tied_back','Buộc gọn'],['none','Không tóc / mũ trùm']]),
  face_style:Object.freeze([['friendly','Thân thiện'],['friendly_glasses','Thân thiện, đeo kính'],['youthful_friendly','Trẻ trung'],['calm_professional','Điềm tĩnh, chuyên nghiệp'],['expressive','Biểu cảm rõ'],['led_face','Mặt LED']]),
  outfit:Object.freeze([['lam_engineer_uniform','Đồng phục kỹ sư LAM'],['teacher_smart_casual','Trang phục giáo viên'],['school_uniform','Đồng phục học sinh'],['electrician_safety_uniform','Đồng phục an toàn điện'],['workwear_navy','Đồ bảo hộ xanh navy'],['casual','Trang phục thường ngày'],['robot_shell','Vỏ robot']])
});
export function getStarterProfile(id='engineer'){return starterCharacterProfiles.find(item=>item.id===id)||starterCharacterProfiles[0];}
export function resolveStarterAppearance(options={}){
  const profile=getStarterProfile(options.starter_template||'engineer');
  const selected={starter_template:profile.id,skin_tone:options.skin_tone||profile.skin_tone,hair_style:options.hair_style||profile.hair_style,face_style:options.face_style||profile.face_style,outfit:options.outfit||profile.outfit};
  for(const key of ['skin_tone','hair_style','face_style','outfit'])if(!starterAppearanceOptions[key].some(([id])=>id===selected[key]))throw new Error('Unsupported starter appearance option "'+key+'".');
  return{profile,...selected};
}
