#!/usr/bin/env node
// Artwork-only publication: retain surveyed/planned GCJ geometry, permissions, places, entrances and media.
const fs=require('node:fs'),path=require('node:path');
const key=points=>{let h=2166136261;for(const c of JSON.stringify(points.map(p=>p.map(n=>Number(n.toFixed(9))))))h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(16)};
const clone=v=>JSON.parse(JSON.stringify(v));
function routes(m){return m.layers.find(l=>l.id==='operator_routes').inlineData.features}
function checkGraph(graph,bundle){const bindings=Object.assign({},...bundle.routes.map(r=>r.properties.artworkEdgeBindings));for(const e of graph.edges){if(!e.sourceRouteId){if(e.lengthM>.05)throw Error('Unexpected non-road connector '+e.id);continue}const b=bindings[e.id],c=clone(e.coordinates);c[0]=graph.nodes[e.a].gcj02;c[c.length-1]=graph.nodes[e.b].gcj02;if(!b||b.sourceGeometryKey!==key(c))throw Error('Navigation geometry changed: '+JSON.stringify({id:e.id,source:e.sourceRouteId,a:e.a,b:e.b,coordinates:c,bindingPresent:!!b,currentKey:key(c),expectedKey:b?.sourceGeometryKey}))}if(graph.edges.filter(e=>e.sourceRouteId).length!==Object.keys(bindings).length)throw Error('Navigation edge count changed')}
async function main(){
 const args=process.argv.slice(2);if(args.some(a=>a!=='--apply'))throw Error('Use no argument for read-only check, or --apply for publication');
 require('dotenv').config({path:path.resolve(__dirname,'../.env')});const {PrismaClient}=require('@prisma/client'),{CampusMapService}=require('../dist/src/modules/campus-map/campus-map.service');
 const prisma=new PrismaClient(),bundle=JSON.parse(fs.readFileSync(path.join(__dirname,'data/cqcx-vector-complete-20260908.json')));try{
 const out=await prisma.$transaction(async tx=>{
  const map=await tx.campusMap.findUnique({where:{regionId:bundle.regionId},include:{draft:true,activeVersion:true}});if(!map?.draft)throw Error('Missing map draft');
  const current=map.draft.manifest;if(routes(map.activeVersion.manifest).every(f=>f.properties?.artworkAlignment?.bundleId===bundle.id)&&map.draft.basedOnVersionId===map.activeVersionId)return {alreadyApplied:true,version:map.activeVersion.version};
  if(map.activeVersion.version!==bundle.expectedActiveVersion||map.draft.basedOnVersionId!==map.activeVersionId)throw Error('Map version/draft changed; current map retained');
  const manifest=clone(current),features=routes(manifest),rows=new Map(bundle.routes.map(r=>[r.id,r]));if(features.length!==148||rows.size!==148)throw Error('Expected 148 source roads');
  for(const f of features){const row=rows.get(f.properties.id);if(!row||JSON.stringify(f.geometry)!==JSON.stringify(row.baselineGeometry))throw Error('Source geometry changed: '+f.properties.id);Object.assign(f.properties,clone(row.properties))}
  manifest.imageMap={...manifest.imageMap,imageUrl:bundle.imageUrl};manifest.version='2026-09-08-vector-complete';
  const scoped=new Proxy(tx,{get:(t,k)=>k==='$transaction'?(callback)=>callback(tx):Reflect.get(t,k)}),service=new CampusMapService(scoped),places=await service.buildPublishedPlaceCatalog(tx,bundle.regionId);
  const compiled=service.compilePublishedNavigation(manifest,places);service.assertPublishedNavigationClosure(places,compiled);checkGraph(compiled.graph,bundle);
  if(!args.includes('--apply'))return {applied:false,roads:features.length,edges:compiled.graph.edges.length,activeVersion:map.activeVersion.version,draftRevision:map.draft.revision};
  const backupDir=path.resolve(__dirname,'../backups/campus-map');fs.mkdirSync(backupDir,{recursive:true,mode:0o700});const backupFile=path.join(backupDir,bundle.id+'-'+Date.now()+'.json');fs.writeFileSync(backupFile,JSON.stringify({map,places}),{mode:0o600,flag:'wx'});
  const saved=await service.saveDraft(bundle.regionId,{config:manifest},bundle.id,map.draft.revision);const published=await service.publishDraft(bundle.regionId,bundle.id,saved.workflow.draftRevision);
  const after=await tx.campusMap.findUnique({where:{regionId:bundle.regionId},include:{activeVersion:true}}),active=after.activeVersion.manifest;
  if(routes(active).some(f=>Object.keys(f.properties.artworkEdgeBindings||{}).length!==Object.keys(rows.get(f.properties.id).properties.artworkEdgeBindings).length))throw Error('Publication lost artwork edge bindings');
  checkGraph(active.navigation.graph,bundle);
  return {applied:true,roads:features.length,edges:compiled.graph.edges.length,version:published.workflow.activeVersion,draftRevision:saved.workflow.draftRevision,backupFile,sourceSvgSha256:bundle.sourceSvgSha256};
 },{isolationLevel:'Serializable',maxWait:10000,timeout:60000});console.log(JSON.stringify(out,null,2));
 }finally{await prisma.$disconnect()}
}
module.exports={checkGraph};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
