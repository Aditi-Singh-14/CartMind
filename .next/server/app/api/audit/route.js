"use strict";(()=>{var e={};e.id=701,e.ids=[701],e.modules={2934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},4580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},5869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},1294:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>g,patchFetch:()=>x,requestAsyncStorage:()=>l,routeModule:()=>p,serverHooks:()=>h,staticGenerationAsyncStorage:()=>m});var s={};r.r(s),r.d(s,{GET:()=>d,revalidate:()=>c});var a=r(9303),i=r(8716),n=r(670),o=r(7070),u=r(9692);let c=0;async function d(e){try{let t=(0,u.l)(),{data:{user:r}}=await t.auth.getUser();if(!r){let t=e.headers.get("Authorization")||e.headers.get("authorization");if(t&&t.startsWith("Bearer ")){let e=t.substring(7),{data:s}=await u.p.auth.getUser(e);s?.user&&(r=s.user)}}if(!r)return o.NextResponse.json({error:"Unauthorized: Authentication required"},{status:401});let s=r.user_metadata?.is_merchant===!0,{data:a}=await u.p.from("customers").select("is_merchant").eq("user_id",r.id),i=a?.some(e=>!0===e.is_merchant);if(!(s||i))return o.NextResponse.json({error:"Forbidden: Merchant audit access restricted to merchant accounts only"},{status:403});let{data:n,error:c}=await u.p.from("agent_decisions").select(`
        id,
        timestamp,
        customer_id,
        input_cart,
        candidate_item_id,
        signal_type,
        reasoning_text,
        bound_check_passed,
        bound_check_rule,
        user_response,
        final_status,
        revenue_delta,
        mcp_call,
        mcp_result,
        customers (
          name
        ),
        products:candidate_item_id (
          name,
          category,
          price
        )
      `).order("timestamp",{ascending:!1});if(c)return o.NextResponse.json({error:c.message},{status:500});return o.NextResponse.json(n||[],{status:200})}catch(e){return o.NextResponse.json({error:e.message||"Internal Server Error"},{status:500})}}let p=new a.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/audit/route",pathname:"/api/audit",filename:"route",bundlePath:"app/api/audit/route"},resolvedPagePath:"/Users/aditisingh/projects/CartMind/app/api/audit/route.ts",nextConfigOutput:"",userland:s}),{requestAsyncStorage:l,staticGenerationAsyncStorage:m,serverHooks:h}=p,g="/api/audit/route";function x(){return(0,n.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:m})}},9692:(e,t,r)=>{r.d(t,{l:()=>u,p:()=>c});var s=r(2290),a=r(7495),i=r(1615);let n="https://uovjnurlkxdjtdzlgomj.supabase.co/rest/v1/".replace(/\/rest\/v1\/?$/,""),o=process.env.SUPABASE_SERVICE_ROLE_KEY||"";function u(){let e=(0,i.cookies)();return(0,s.l)(n,"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvdmpudXJsa3hkanRkemxnb21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTUzNzUsImV4cCI6MjEwNDAzMTM3NX0.hxGTdKVlYUH2xfJzmig6zikTmyRwufgNbSrfAXfcTvg",{cookies:{getAll:()=>e.getAll(),setAll(t){try{t.forEach(({name:t,value:r,options:s})=>e.set(t,r,s))}catch{}}}})}let c=(0,a.eI)(n,o,{auth:{persistSession:!1,autoRefreshToken:!1}})}};var t=require("../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),s=t.X(0,[276,671,972],()=>r(1294));module.exports=s})();