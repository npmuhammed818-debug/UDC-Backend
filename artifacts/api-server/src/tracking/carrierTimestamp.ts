/** Carrier timestamps need a real calendar date and explicit UTC offset.
 * Date.parse alone silently normalizes impossible dates such as February 30. */
export function validCarrierTimestamp(value:unknown):value is string{
 if(typeof value!=='string')return false;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);if(!m)return false;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(year<1||month<1||month>12||day<1||day>days[month-1]!||hour>23||minute>59||second>59)return false;
 if(m[7]&&(Number(m[8])>14||Number(m[9])>59||Number(m[8])===14&&Number(m[9])!==0))return false;
 return Number.isFinite(Date.parse(value));
}
