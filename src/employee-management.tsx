import { useState } from 'react'
import { EmployeeWorkflow } from './employees'
import { EmployeeImport } from './employee-import'

type Profile={id:string;company_id:string;role:string}

export function EmployeeManagement({profile}:{profile:Profile}){
 const [version,setVersion]=useState(0)
 return <>
  <EmployeeImport profile={profile} onImported={()=>setVersion(v=>v+1)}/>
  <EmployeeWorkflow key={version} profile={profile}/>
 </>
}
