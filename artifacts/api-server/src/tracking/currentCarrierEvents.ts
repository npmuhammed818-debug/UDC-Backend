import {validCarrierTimestamp} from './carrierTimestamp.ts';
import type {ShipmentTrackEvent} from './seventeenTrack.ts';
/** Validate the entire bounded feed, then order by actual event time. A
 * conflicting newest timestamp is not a reliable latest carrier report. */
export function currentCarrierEvents(events:ShipmentTrackEvent[],now=new Date()):ShipmentTrackEvent[]|null{
 if(!Number.isFinite(now.getTime())||events.length>1000)return null;
 if(events.some(e=>!e||!validCarrierTimestamp(e.time)||Date.parse(e.time)>now.getTime()||typeof e.description!=='string'||!e.description.trim()))return null;
 const ordered=[...events].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
 const latest=ordered[0];if(latest&&ordered.some(e=>Date.parse(e.time)===Date.parse(latest.time)&&(e.description.trim()!==latest.description.trim()||(e.location??'').trim()!==(latest.location??'').trim())))return null;
 return ordered;
}
