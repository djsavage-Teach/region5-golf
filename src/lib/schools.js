export const SCHOOLS = [
  { id: "BOX ELDER", name: "BOX ELDER", url: "https://cmsv2-assets.apptegy.net/uploads/7672/logo/9154/bee_new.png", color: "#6b21a8" }, 
  { id: "BONNEVILLE", name: "BONNEVILLE", url: "https://core-docs.s3.amazonaws.com/weber_school_district__ut_ar/article/image/large_b2cffc0f-68ec-428c-a650-81767d56453b.png", color: "#1e3a8a" }, 
  { id: "WEST FIELD", name: "WEST FIELD", url: "https://assets.hometownticketing.com/clients/westfield/logos/school_logo_ebc133bd.png", color: "#c2410c" }, 
  { id: "FREMONT", name: "FREMONT", url: "https://assets.hometownticketing.com/clients/fremontathletics/logos/school_logo_c1182661.png", color: "#2563eb" }, 
  { id: "NORTHRIDGE", name: "NORTHRIDGE", url: "https://sportshub2-uploads.vnn-prod.zone/files/sites/429/2020/09/29204806/KnightVectorGraphic.png", color: "#991b1b" }, 
  { id: "CLEARFIELD", name: "CLEARFIELD", url: "https://sportshub2-uploads.vnn-prod.zone/files/sites/1722/2017/07/26012144/12552.png", color: "#15803d" }, 
  { id: "ROY", name: "ROY", url: "https://cmsv2-assets.apptegy.net/uploads/25031/file/5081095/46ab505e-f612-4145-9e63-ec68e8782242.jpeg", color: "#eab308" }, 
]

export function getSchoolInfo(schoolName) {
  if (!schoolName) return { url: '', color: '#334155' }
  const upper = schoolName.toUpperCase().trim()
  const found = SCHOOLS.find((s) => upper.includes(s.id) || s.id.includes(upper))
  return found || { url: '', color: '#334155' }
}