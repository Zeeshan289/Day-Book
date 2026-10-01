// Smoke test for the API. Run ONLY on a fresh test database (it changes settings and adds data).
// Start the API first, then: node scripts/smoke-test.mjs
// Uses OWNER_USERNAME=owner / OWNER_PASSWORD=secret123 from a test .env.
const B='http://localhost:4000/api';
let T;
async function c(p,m='GET',b){const r=await fetch(B+p,{method:m,headers:{'Content-Type':'application/json',...(T?{Authorization:'Bearer '+T}:{})},body:b?JSON.stringify(b):undefined});const j=await r.json();if(!r.ok)console.log('ERR',r.status,p,j);return j;}
const l=await c('/auth/login','POST',{username:'owner',password:'secret123'});T=l.token;
const s=await c('/settings'); const today=s.today;
const y=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
await c('/settings','PUT',{business_name:'Ox Test',start_date:y,opening_cash:1825083,opening_bank:0});
const cats=await c('/categories'); const cat=n=>cats.find(x=>x.name===n).id;
const irfan=await c('/people','POST',{name:'Irfan Naseem',type:'employee'});
const karim=await c('/people','POST',{name:'Karim',type:'customer'});
const add=b=>c('/entries','POST',{entry_date:today,mode:'cash',...b});
await add({type:'receipt',description:'Cash sale',amount:26663,category_id:cat('Cash Sale')});
await add({type:'receipt',description:'Credit sale',amount:298526,mode:'credit',person_id:karim.id,category_id:cat('Credit Sale')});
await add({type:'payment',description:'Tea cups 1 dozen',amount:1100});
await add({type:'payment',description:'Water bottles',amount:750});
const ice=await add({type:'payment',description:'Ice bags 3kg',qty:10,rate:250,category_id:cat('Drinks & Ice')});
console.log('ice amount',ice.amount);
await add({type:'payment',description:'Fine flour',amount:13400});
await add({type:'payment',description:'Charity',amount:1000});
await add({type:'payment',description:'Fish & chicken',amount:15600});
await add({type:'payment',description:'Advance salary',amount:13033,person_id:irfan.id,category_id:cat('Salary Advance')});
const tp=await add({type:'payment',description:'T/P adj',amount:3805});
const wrong=await add({type:'payment',description:'mistake',amount:999});
await c(`/entries/${wrong.id}/void`,'POST',{reason:'typo'});
await c(`/entries/${tp.id}`,'PUT',{...tp,amount:3805,description:'T/P adjustment'});
await c('/entries','POST',{entry_date:today,type:'payment',mode:'credit',description:'x',amount:5}); // should error
await c('/entries','POST',{entry_date:today,type:'payment',mode:'cash',description:'x',amount:5,category_id:cat('Cash Sale')}); // should error
const d=await c('/daybook/'+today);
console.log('opening',d.opening,'closing',d.closing,'pay cash',d.totals.payment.cash,'entries',d.entries.length);
const r=await c(`/reports/summary?from=${y}&to=${today}`); console.log('report closing',r.closing, r.byCategory.length, r.byDay);
const ppl=await c('/people'); console.log(ppl.map(p=>[p.name,p.balance]));
const led=await c(`/people/${karim.id}/ledger`); console.log('karim',led.person.balance, led.entries.length);
const ch=await c('/cheques','POST',{cheque_no:'5438',party_name:'Mujeeb',amount:132000,direction:'received',cheque_date:today});
const cl=await c(`/cheques/${ch.id}/status`,'POST',{status:'cleared',add_entry:true,category_id:cat('Customer Payment')});
console.log('cheque',cl.status,cl.entry_id);
const d2=await c('/daybook/'+today); console.log('closing after cheque',d2.closing);
const u=await c('/users','POST',{name:'Ali',username:'ali',password:'pass123',role:'cashier'});
const l2=await c('/auth/login','POST',{username:'ali',password:'pass123'}); T=l2.token;
await c('/entries','POST',{entry_date:y,type:'payment',mode:'cash',description:'old',amount:5}); // should 403
const own=await add({type:'payment',description:'cashier item',amount:50});
await c(`/entries/${tp.id}/void`,'POST',{reason:'x'}); // 403
await c('/users'); // 403
await c('/entries/'+own.id+'/history'); // 403: history is owner only now

// ---------- Checks for the audit fixes. Each prints PASS or FAIL. ----------
let failed=0;
function check(name,ok){console.log(ok?'PASS':'FAIL',name);if(!ok)failed++;}
// Call the API with a given token; returns {status, j}.
async function raw(p,token,m='GET',b){const r=await fetch(B+p,{method:m,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:b?JSON.stringify(b):undefined});return {status:r.status,j:await r.json().catch(()=>({}))};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ownerTok=async(pw='secret123')=>(await raw('/auth/login',null,'POST',{username:'owner',password:pw})).j.token;
T=await ownerTok();
check('5. cashier cannot read entry history',(await raw('/entries/'+own.id+'/history',l2.token)).status===403);
check('5. owner can read entry history',(await raw('/entries/'+own.id+'/history',T)).status===200);

// 1. Password change / reset logs out old sessions.
const oldA=await ownerTok(), oldB=await ownerTok();
const cashierOld=(await raw('/auth/login',null,'POST',{username:'ali',password:'pass123'})).j.token;
await wait(1100); // tokens count time in whole seconds
const ch1=await raw('/auth/change-password',oldA,'POST',{current_password:'secret123',new_password:'secret456'});
check('1. change-password returns a new token',ch1.status===200&&!!ch1.j.token);
check('1. other old owner login is rejected',(await raw('/auth/me',oldB)).status===401);
check('1. old token used for the change is rejected',(await raw('/auth/me',oldA)).status===401);
check('1. new token from change-password works',(await raw('/auth/me',ch1.j.token)).status===200);
check('1. old password no longer logs in',(await raw('/auth/login',null,'POST',{username:'owner',password:'secret123'})).status===401);
await wait(1100);
const ch2=await raw('/auth/change-password',ch1.j.token,'POST',{current_password:'secret456',new_password:'secret123'}); // put it back
T=ch2.j.token;
check('1. cashier login works before reset',(await raw('/auth/me',cashierOld)).status===200);
const reset=await raw('/users/'+u.id,T,'PATCH',{password:'newpass1'});
check('1. owner reset of cashier password',reset.status===200);
check('1. cashier old login rejected after reset',(await raw('/auth/me',cashierOld)).status===401);
const cashierNew=(await raw('/auth/login',null,'POST',{username:'ali',password:'newpass1'})).j.token;
check('1. cashier new password works',(await raw('/auth/me',cashierNew)).status===200);
const auditRows=(await raw('/audit',T)).j;
check('1/6. audit has user changes and no password hashes',auditRows.some(a=>a.table_name==='users')&&!JSON.stringify(auditRows).includes('password_hash'));

// 2. Impossible dates are a clear 400, not a server error.
check('2. day book 2026-02-31 gives 400',(await raw('/daybook/2026-02-31',T)).status===400);
check('2. entry dated 2026-02-30 gives 400',(await raw('/entries',T,'POST',{entry_date:'2026-02-30',type:'payment',mode:'cash',description:'x',amount:5})).status===400);
check('2. report to 2026-04-31 gives 400',(await raw('/reports/summary?from=2026-04-01&to=2026-04-31',T)).status===400);
check('2. real leap day 2024-02-29 is accepted as a date',(await raw('/entries?from=2024-02-29&to=2024-02-29',T)).status===200);

// 3. Renaming a category to a name that exists gives a clear 400.
const catA=(await raw('/categories',T,'POST',{name:'Test Gas',type:'payment'})).j;
const catB=(await raw('/categories',T,'POST',{name:'Test Water',type:'payment'})).j;
const dupRename=await raw('/categories/'+catB.id,T,'PATCH',{name:'test gas'});
check('3. rename to existing name gives 400 with a message',dupRename.status===400&&/already/.test(dupRename.j.error||''));
check('3. rename to own name still works',(await raw('/categories/'+catA.id,T,'PATCH',{name:'Test Gas'})).status===200);
check('3. rename to new name works',(await raw('/categories/'+catB.id,T,'PATCH',{name:'Test Water Bills'})).status===200);
check('3. same name on the other side is allowed',(await raw('/categories',T,'POST',{name:'Test Gas',type:'receipt'})).status===201);

// 4. qty x rate with rate rounded to paisa.
const qr=(await raw('/entries',T,'POST',{entry_date:today,type:'payment',mode:'cash',description:'rate test',qty:3,rate:1.005})).j;
check('4. rate 1.005 is saved as 1.01 and amount = 3.03',qr.rate===1.01&&qr.amount===3.03);
await raw('/entries/'+qr.id+'/void',T,'POST',{reason:'test only'});

// 7. Cheque whose day book entry was voided can change status again.
const ch7=(await raw('/cheques',T,'POST',{cheque_no:'7001',party_name:'Test Party',amount:5000,direction:'received',cheque_date:today})).j;
const cl7=(await raw('/cheques/'+ch7.id+'/status',T,'POST',{status:'cleared',add_entry:true})).j;
check('7. cleared cheque is linked to an entry',!!cl7.entry_id);
check('7. bounced is blocked while the entry is live',(await raw('/cheques/'+ch7.id+'/status',T,'POST',{status:'bounced'})).status===400);
await raw('/entries/'+cl7.entry_id+'/void',T,'POST',{reason:'cheque bounced'});
const b7=await raw('/cheques/'+ch7.id+'/status',T,'POST',{status:'bounced'});
check('7. after voiding the entry, bounced works and link is cleared',b7.status===200&&b7.j.status==='bounced'&&b7.j.entry_id===null);
const re7=await raw('/cheques/'+ch7.id+'/status',T,'POST',{status:'cleared',add_entry:true});
check('7. clearing again adds a new entry',re7.status===200&&!!re7.j.entry_id&&re7.j.entry_id!==cl7.entry_id);

// 8. Export flag.
const ex=(await raw(`/entries?from=${y}&to=${today}&export=1`,T)).j;
check('8. export returns entries and truncated=false',Array.isArray(ex.entries)&&ex.truncated===false);
check('8. normal list is still a plain array',Array.isArray((await raw(`/entries?from=${y}&to=${today}`,T)).j));

// ---------- Ledger features ----------
const r2=n=>Math.round(n*100)/100;
// Opening balance: owner only, counted in balances, first row of the ledger, in the audit log.
const cashierOpen=await raw('/people',cashierNew,'POST',{name:'Cashier Try',type:'customer',opening_balance:500});
check('L1. cashier cannot set an opening balance',cashierOpen.status===403);
const cashierPlain=await raw('/people',cashierNew,'POST',{name:'Cashier Plain',type:'customer'});
check('L1. cashier can still add a person without one',cashierPlain.status===201&&cashierPlain.j.opening_balance===0);
const sami=(await raw('/people',T,'POST',{name:'Sami Supplier',type:'supplier',opening_balance:-2500.5,opening_date:y})).j;
check('L1. owner sets a negative opening balance',sami.opening_balance===-2500.5&&sami.opening_date===y&&sami.balance===-2500.5);
const oldCust=(await raw('/people',T,'POST',{name:'Old Customer',type:'customer',opening_balance:1000})).j;
check('L1. no date given: the book start date is used',oldCust.opening_date===y,oldCust.opening_date);
check('L1. future opening date is refused',(await raw('/people',T,'POST',{name:'X',opening_balance:5,opening_date:'2099-01-01'})).status===400);
check('L1. cashier cannot change an opening balance',(await raw('/people/'+oldCust.id,cashierNew,'PATCH',{opening_balance:1})).status===403);
// Sami: yesterday flour on credit (we owe more), today we pay cash.
await raw('/entries',T,'POST',{entry_date:y,type:'payment',mode:'credit',description:'Flour on credit',amount:4000,person_id:sami.id});
await raw('/entries',T,'POST',{entry_date:today,type:'payment',mode:'cash',description:'Payment to Sami',amount:3000,person_id:sami.id});
const samiRow=(await raw('/people?q=Sami',T)).j.find(p=>p.id===sami.id);
check('L1. person balance includes the opening balance',samiRow.balance===-3500.5,samiRow.balance);

// Person ledger with dates.
const full=(await raw(`/people/${sami.id}/ledger`,T)).j;
check('L2. full ledger: opening = opening balance, closing = balance now',full.opening===-2500.5&&full.closing===-3500.5&&full.entries.length===2);
check('L2. running balance after each entry',full.entries[0].running===-6500.5&&full.entries[1].running===-3500.5);
const period=(await raw(`/people/${sami.id}/ledger?from=${today}&to=${today}`,T)).j;
check('L2. period: opening includes earlier entries',period.opening===-6500.5&&period.entries.length===1&&period.closing===-3500.5&&period.person.balance===-3500.5);
const upToY=(await raw(`/people/${sami.id}/ledger?to=${y}`,T)).j;
check('L2. up to yesterday only',upToY.closing===-6500.5&&upToY.entries.length===1&&upToY.person.balance===-3500.5);
check('L2. from after to gives 400',(await raw(`/people/${sami.id}/ledger?from=${today}&to=${y}`,T)).status===400);
check('L2. bad date gives 400',(await raw(`/people/${sami.id}/ledger?from=2026-02-30`,T)).status===400);
await raw('/people/'+sami.id,T,'PATCH',{opening_balance:-500});
check('L1. owner changes the opening balance',(await raw(`/people/${sami.id}/ledger`,T)).j.person.balance===-1500);
const samiAudit=(await raw('/audit',T)).j.find(a=>a.table_name==='people'&&a.record_id===sami.id&&a.action==='update');
check('L1. the change is in the audit log',samiAudit&&samiAudit.old_data.opening_balance===-2500.5&&samiAudit.new_data.opening_balance===-500);
check('L1. deactivating keeps the opening balance',(await raw('/people/'+sami.id,T,'PATCH',{active:false})).j.opening_balance===-500);
await raw('/people/'+sami.id,T,'PATCH',{active:true});

// Receive payment: an ordinary entry with this person (cashier, today).
const recv=await raw('/entries',cashierNew,'POST',{entry_date:today,type:'receipt',mode:'cash',description:'Payment from Old Customer',amount:400,person_id:oldCust.id});
check('L3. cashier records a payment from a person',recv.status===201);
check('L3. it lowers what they owe',(await raw(`/people/${oldCust.id}/ledger`,T)).j.person.balance===600);

// Cash and bank books agree with the day book.
const dayNow=(await raw('/daybook/'+today,T)).j;
const cashBook=(await raw(`/ledgers/book?mode=cash&from=${y}&to=${today}`,T)).j;
check('L4. cash book closing = day book closing cash',cashBook.closing===dayNow.closing.cash,`${cashBook.closing} vs ${dayNow.closing.cash}`);
check('L4. last running balance = closing',cashBook.entries.at(-1).running===cashBook.closing);
check('L4. cash book has only cash entries',cashBook.entries.every(e=>e.mode==='cash'));
check('L4. cancelled entries listed but not counted',cashBook.entries.some(e=>e.voided)&&r2(cashBook.opening+cashBook.totals.in-cashBook.totals.out)===cashBook.closing);
const bankBook=(await raw(`/ledgers/book?mode=bank&from=${y}&to=${today}`,T)).j;
check('L4. bank book closing = day book closing bank',bankBook.closing===dayNow.closing.bank&&bankBook.entries.every(e=>e.mode==='bank'));
const cashToday=(await raw(`/ledgers/book?mode=cash&from=${today}&to=${today}`,T)).j;
check('L4. cash book opening today = day book opening cash',cashToday.opening===dayNow.opening.cash);
check('L4. start before the book is moved to the book start',(await raw(`/ledgers/book?mode=cash&from=2000-01-01&to=${today}`,T)).j.from===y);
check('L4. mode must be cash or bank',(await raw(`/ledgers/book?mode=credit&from=${y}&to=${today}`,T)).status===400);
const rep=(await raw(`/reports/summary?from=${y}&to=${today}`,T)).j;
const iceLed=(await raw(`/ledgers/category/${cat('Drinks & Ice')}?from=${y}&to=${today}`,T)).j;
check('L4. category ledger total = report category total',iceLed.total===rep.byCategory.find(x=>x.category==='Drinks & Ice').total&&iceLed.entries.at(-1).running===iceLed.total);
const creditLed=(await raw(`/ledgers/category/${cat('Credit Sale')}?from=${y}&to=${today}`,T)).j;
check('L4. category ledger counts credit entries',creditLed.credit===298526&&creditLed.total===298526);
check('L4. unknown category gives 404',(await raw(`/ledgers/category/999999?from=${y}&to=${today}`,T)).status===404);
const bal=(await raw('/ledgers/balances',T)).j;
const everyone=(await raw('/people',T)).j;
check('L4. receivable total = sum of positive balances',bal.total_receivable===r2(everyone.filter(p=>p.balance>0).reduce((a,p)=>a+p.balance,0)));
check('L4. payable total = sum of negative balances',bal.total_payable===r2(-everyone.filter(p=>p.balance<0).reduce((a,p)=>a+p.balance,0)));
check('L4. nobody with a zero balance is listed',![...bal.receivables,...bal.payables].some(p=>p.balance===0)&&!bal.receivables.some(p=>p.id===cashierPlain.j.id));
check('L4. Sami is in payables',bal.payables.some(p=>p.id===sami.id&&p.balance===-1500));
check('L4. cashier can read ledgers',(await raw('/ledgers/balances',cashierNew)).status===200);
check('L4. ledgers need a login',(await raw('/ledgers/balances',null)).status===401);

console.log(failed?`${failed} check(s) FAILED`:'All checks passed');
process.exitCode=failed?1:0;
