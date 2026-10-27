import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const apiKey = process.env.GEMINI_API_KEY?.trim();
const scrypt = promisify(crypto.scrypt);
const usersFile = path.join(__dirname, "users.json");
const sessions = new Map();
app.disable("x-powered-by");
app.use(express.json({ limit: "15mb" }));
async function readUsers(){try{return JSON.parse(await fs.readFile(usersFile,"utf8"))}catch{return []}}
async function writeUsers(users){await fs.writeFile(usersFile,JSON.stringify(users,null,2),{mode:0o600})}
function publicUser(u){return {name:u.name,email:u.email}}
function authUser(req){const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");return sessions.get(token)||null}
const pendingAuth = new Map();
const codeStore = new Map();
async function sendEmail(to, subject, textBody) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass || !from) {
    throw new Error("Email is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM to .env.");
  }
  if (![465, 587].includes(port)) {
    throw new Error("SMTP_PORT must be 465 (SSL) or 587 (STARTTLS).");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  const result = await transporter.sendMail({
    from: `FitForge <${from}>`,
    to,
    subject,
    text: textBody,
  });
  console.log(`Email accepted by SMTP server. Message ID: ${result.messageId}`);
  return result;
}
function makeCode(){return String(crypto.randomInt(0,1000000)).padStart(6,"0")}
function saveCode(key, code, payload){codeStore.set(key,{code,payload,expires:Date.now()+10*60*1000,attempts:0})}
function validCode(key,code){const entry=codeStore.get(key);if(!entry||entry.expires<Date.now()||entry.attempts>=5){codeStore.delete(key);return null}if(entry.code!==String(code||"")){entry.attempts++;return null}codeStore.delete(key);return entry.payload}
function checkCode(key,code){const entry=codeStore.get(key);if(!entry||entry.expires<Date.now()||entry.attempts>=5){codeStore.delete(key);return false}if(entry.code!==String(code||"")){entry.attempts++;return false}return true}
app.post("/api/auth/register/start", async (req,res)=>{
 try {
  const name=String(req.body?.name||"").trim().slice(0,60),email=String(req.body?.email||"").trim().toLowerCase();
  if(name.length<2)return res.status(400).json({error:"Enter your name (at least 2 characters)."});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});
  const users=await readUsers();if(users.some(u=>u.email===email))return res.status(409).json({error:"This email already has an account. Sign in instead."});
  const code=makeCode();saveCode("register:"+email,code,{name,email});
  await sendEmail(email,"Your FitForge verification code",`Hi ${name},\n\nYour FitForge verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`);
  res.json({message:"Verification code sent. Check your email inbox and spam folder."});
 } catch(e){console.error("Register verification error",e);res.status(503).json({error:e.message.includes("not configured")?"Email verification is not configured yet. Add SMTP settings to .env first.":"Could not send the verification email. Check SMTP settings and try again."})}
});
app.post("/api/auth/register/check-code",(req,res)=>{
 const email=String(req.body?.email||"").trim().toLowerCase(),code=String(req.body?.code||"").trim();
 if(!/^\d{6}$/.test(code))return res.status(400).json({error:"Enter the 6-digit code from your email."});
 if(!checkCode("register:"+email,code))return res.status(400).json({error:"That code is incorrect or expired. Check it and try again, or request a new code."});
 res.json({message:"Email verified. Now create your password."});
});
app.post("/api/auth/register/resend",async(req,res)=>{
 try{const name=String(req.body?.name||"").trim().slice(0,60),email=String(req.body?.email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});const users=await readUsers();if(users.some(u=>u.email===email))return res.status(409).json({error:"This email already has an account. Sign in instead."});const code=makeCode();saveCode("register:"+email,code,{name,email});await sendEmail(email,"Your FitForge verification code",`Hi ${name||"there"},\n\nYour new FitForge verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`);res.json({message:"A new verification code has been sent."});}
 catch(e){console.error("Resend verification error",e);res.status(503).json({error:e.message.includes("not configured")?"Email verification is not configured yet. The site owner must configure email delivery first.":"Could not resend the code. Check email settings and try again."})}
});
app.post("/api/auth/register/verify", async(req,res)=>{
 try{
  const email=String(req.body?.email||"").trim().toLowerCase(),code=String(req.body?.code||""),password=String(req.body?.password||""),confirm=String(req.body?.confirmPassword||"");
  if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});
  if(password!==confirm)return res.status(400).json({error:"Passwords do not match."});
  const pending=validCode("register:"+email,code);if(!pending)return res.status(400).json({error:"The code is invalid or expired. Request a new code."});
  const users=await readUsers();if(users.some(u=>u.email===email))return res.status(409).json({error:"This email already has an account. Please sign in."});
  const salt=crypto.randomBytes(16).toString("hex"),hash=(await scrypt(password,salt,64)).toString("hex");
  const user={id:crypto.randomUUID(),name:pending.name,email,salt,hash,emailVerified:true,createdAt:new Date().toISOString()};users.push(user);await writeUsers(users);
  res.status(201).json({message:"Account created successfully. Now sign in with your email and password.",user:publicUser(user)});
 }catch(e){console.error("Register verify error",e);res.status(500).json({error:"Could not finish creating your account. Please try again."})}
});
app.post("/api/auth/login",async(req,res)=>{
 try{const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");const users=await readUsers(),u=users.find(x=>x.email===email);if(!u)return res.status(401).json({error:"Email or password is incorrect."});const hash=(await scrypt(password,u.salt,64)).toString("hex");if(!crypto.timingSafeEqual(Buffer.from(hash,"hex"),Buffer.from(u.hash,"hex")))return res.status(401).json({error:"Email or password is incorrect."});const token=crypto.randomBytes(32).toString("hex");sessions.set(token,u.id);res.json({token,user:publicUser(u)});
 }catch(e){console.error("Login error",e);res.status(500).json({error:"Could not sign in. Please try again."})}
});
app.post("/api/auth/forgot/start",async(req,res)=>{
 try{const email=String(req.body?.email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});const users=await readUsers(),u=users.find(x=>x.email===email);if(!u)return res.json({message:"If an account exists for that email, a reset code has been sent."});const code=makeCode();saveCode("reset:"+email,code,{email});await sendEmail(email,"Reset your FitForge password",`Your FitForge password reset code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`);res.json({message:"If an account exists for that email, a reset code has been sent."});}
 catch(e){console.error("Forgot password error",e);res.status(503).json({error:e.message.includes("not configured")?"Email verification is not configured yet. Add SMTP settings to .env first.":"Could not send a reset email. Check SMTP settings and try again."})}
});
app.post("/api/auth/forgot/reset",async(req,res)=>{
 try{const email=String(req.body?.email||"").trim().toLowerCase(),code=String(req.body?.code||""),password=String(req.body?.password||""),confirm=String(req.body?.confirmPassword||"");if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});if(password!==confirm)return res.status(400).json({error:"Passwords do not match."});const payload=validCode("reset:"+email,code);if(!payload)return res.status(400).json({error:"The code is invalid or expired. Request a new code."});const users=await readUsers(),u=users.find(x=>x.email===email);if(!u)return res.status(400).json({error:"Account not found. Please create an account."});u.salt=crypto.randomBytes(16).toString("hex");u.hash=(await scrypt(password,u.salt,64)).toString("hex");await writeUsers(users);res.json({message:"Password updated. You can now sign in."});}
 catch(e){console.error("Password reset error",e);res.status(500).json({error:"Could not reset password. Please try again."})}
});
app.get("/api/auth/me",async(req,res)=>{const id=authUser(req);if(!id)return res.status(401).json({error:"Please sign in again."});const user=(await readUsers()).find(u=>u.id===id);if(!user)return res.status(401).json({error:"Account not found."});res.json({user:publicUser(user)})});

// Per-account data sync (FitForge & Detective Agency). Only the authenticated account can read/write its own data.
const ACCOUNT_DATA_KEYS = new Set([
  "fitforge-v1", "fitforge-custom-foods", "fitforge-custom-week", "fitforge-body-entries",
  "detective-v1", "detective-cases", "detective-notes", "detective-rooms", "detective-profile", "detective-achievements"
]);
function cleanAccountData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Account data must be an object.");
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ACCOUNT_DATA_KEYS.has(key) && !/^fitforge-week-plan:[^\\/]{1,254}$/.test(key) && !key.startsWith("detective-")) continue;
    const serialized = JSON.stringify(value);
    if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > 10 * 1024 * 1024) throw new Error("One saved item is too large.");
    out[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > 12 * 1024 * 1024) throw new Error("Your saved data is too large. Remove some large photos and try again.");
  return out;
}
app.get("/api/account/data", async (req, res) => {
  try {
    const id = authUser(req);
    if (!id) return res.status(401).json({ error: "Please sign in again." });
    const users = await readUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(401).json({ error: "Account not found." });
    res.json({ data: user.data || null, updatedAt: user.dataUpdatedAt || null });
  } catch (error) { console.error("Account data read error:", error); res.status(500).json({ error: "Could not load your saved data." }); }
});
app.put("/api/account/data", async (req, res) => {
  try {
    const id = authUser(req);
    if (!id) return res.status(401).json({ error: "Please sign in again." });
    const data = cleanAccountData(req.body?.data);
    const users = await readUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(401).json({ error: "Account not found." });
    user.data = data;
    user.dataUpdatedAt = new Date().toISOString();
    await writeUsers(users);
    res.json({ ok: true, updatedAt: user.dataUpdatedAt });
  } catch (error) {
    console.error("Account data save error:", error);
    res.status(400).json({ error: error.message || "Could not save your data." });
  }
});
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
app.use(express.static(__dirname));

app.post("/api/analyze-food", async (req, res) => {
  try {
    if (!apiKey) return res.status(503).json({ error: "GEMINI_API_KEY is missing. Add your Google AI Studio key to .env and restart the server." });
    const { image, language = "en" } = req.body || {};
    if (typeof image !== "string" || !image.startsWith("data:image/")) return res.status(400).json({ error: "Upload a valid food image first." });
    const match = image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) return res.status(400).json({ error: "Supported image types: JPEG, PNG, WEBP or GIF." });
    const imageBytes = Buffer.byteLength(match[2], "base64");
    if (imageBytes > 8 * 1024 * 1024) return res.status(413).json({ error: "Image is too large. Please use an image under 8 MB." });
    const requestedLanguage = language === "ar" ? "Arabic" : "English";
    const prompt = `Analyze this photo. Reply ONLY valid JSON in ${requestedLanguage}. First determine if visible edible food exists. If no food is clearly visible return {"is_food":false,"meal_name":"No food detected","items":[],"notes":"I can’t see food clearly in this image. Please upload a clear photo of food."}. If food is visible, identify only plausible visible foods and separate distinct components when useful. Estimate edible portion weight in grams using plate/bowl as rough scale; explicitly state uncertainty if scale is unclear. For each food return: name, portion_g, and nutrition PER 100 GRAMS for the closest matching prepared food: calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g. Do not return portion totals. Match preparation state (cooked vs raw) and common Egyptian dish names when recognizable. For mixed dishes such as koshari or macaroni béchamel, use a reasonable generic prepared-dish reference and acknowledge recipe variation; do not invent exact ingredients. If identification is uncertain, use a broad label and say so. Keep values plausible and calories broadly consistent with macros. Schema: {"is_food":true,"meal_name":"...","items":[{"name":"...","portion_g":300,"calories_per_100g":160,"protein_per_100g":6,"carbs_per_100g":20,"fat_per_100g":6}],"notes":"Portion and nutrition are estimates; recipe and oil can change values."}. Use nonnegative numeric values, max 8 items, concise.`;
    const mimeType = match[1];
    const imageBase64 = match[2].replace(/\s/g, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    let response;
    try { response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 750 }
      })
    }); } catch (err) {
      if (err?.name === "AbortError") return res.status(504).json({ error: "Food analysis took longer than expected. Please try again shortly." });
      throw err;
    } finally { clearTimeout(timeout); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiMessage = body?.error?.message || "Unknown Gemini API error";
      console.error("Gemini API error:", response.status, apiMessage);
      if (response.status === 400 || response.status === 403) return res.status(502).json({ error: `Gemini rejected the request or API key: ${apiMessage}` });
      if (response.status === 401) return res.status(502).json({ error: "Gemini API key was rejected. Create/check your key in Google AI Studio and make sure .env uses GEMINI_API_KEY." });
      if (response.status === 429) return res.status(429).json({ error: `Gemini usage limit reached. Check your model's free-tier availability and quota in Google AI Studio. Details: ${apiMessage}` });
      return res.status(502).json({ error: `Gemini request failed (${response.status}): ${apiMessage}` });
    }
    const outputText = body?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    let parsed;
    try { parsed = JSON.parse(outputText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch { console.error("Unreadable Gemini response:", outputText.slice(0, 500)); return res.status(502).json({ error: "Gemini returned an unreadable result. Please try again with a clearer photo." }); }
    if (parsed?.is_food === false || !Array.isArray(parsed?.items) || parsed.items.length === 0) {
      return res.json({ is_food: false, meal_name: String(parsed?.meal_name || "No food detected").slice(0,120), items: [], notes: String(parsed?.notes || "I can’t see food clearly in this image. Please upload a clear photo of the food.").slice(0,500) });
    }
    const safeNum = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100000, Math.round(n * 10) / 10)) : 0; };
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 8).map(x => {
      const portion_g = safeNum(x.portion_g);
      const calories_per_100g = safeNum(x.calories_per_100g ?? x.kcal_per_100g);
      const protein_per_100g = safeNum(x.protein_per_100g);
      const carbs_per_100g = safeNum(x.carbs_per_100g);
      const fat_per_100g = safeNum(x.fat_per_100g);
      const scale = portion_g / 100;
      return { name: String(x.name || "Food").slice(0,100), portion_g, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, calories: Math.round(calories_per_100g * scale), protein_g: Math.round(protein_per_100g * scale * 10) / 10, carbs_g: Math.round(carbs_per_100g * scale * 10) / 10, fat_g: Math.round(fat_per_100g * scale * 10) / 10 };
    }) : [];
    res.json({ is_food: true, meal_name: String(parsed.meal_name || "Meal").slice(0,120), items, notes: String(parsed.notes || "Visual estimate only; actual nutrition may differ.").slice(0,500) });
  } catch (error) {
    console.error("Food analysis error:", error?.message || error);
    res.status(500).json({ error: "Food analysis failed. Check the VS Code terminal for details and confirm your Gemini API setup." });
  }
});

app.post("/api/generate-budget-plan", async (req, res) => {
  try {
    if (!apiKey) return res.status(503).json({error:"GEMINI_API_KEY is missing. Add your Gemini API key to .env and restart the server."});
    const budget = Number(req.body?.budget);
    const goal = String(req.body?.goal || "maintain");
    const avoid = String(req.body?.avoid || "").slice(0,500);
    const language = req.body?.language === "ar" ? "Arabic (Egyptian Arabic)" : "English";
    const p = req.body?.profile || {};
    if (!Number.isFinite(budget) || budget < 150 || budget > 50000) return res.status(400).json({error:"A realistic 7-day meal plan needs a weekly budget of at least 150 EGP. Enter 150–50000 EGP; this is a conservative minimum, not a guarantee that every nutritional target can fit."});
    const goalLabel = ({bulk:"muscle gain",loss:"weight loss",cut:"cutting/body recomposition",maintain:"maintain weight"})[goal] || "maintain weight";
    const prompt = `You are a careful nutrition meal-planning assistant for an Egyptian user. Create a genuinely personalized, varied 7-day menu from the user's budget, not a fixed/reused template. Reply ONLY valid JSON in ${language}.\nINPUT: weekly total budget ${budget} EGP; goal ${goalLabel}; foods to avoid: ${avoid || "none stated"}; age ${p.age||"unknown"}; height cm ${p.height||"unknown"}; weight kg ${p.weight||"unknown"}; activity ${p.activity||"unknown"}; profile daily calorie target ${p.dailyCalories||"not set"}; protein target g/day ${p.protein||"not set"}.\nUse common affordable foods in Egypt and rotate meals across days so that entering a different budget/goal/avoid list leads to a meaningfully different plan. Budget-tier logic is mandatory: for 150–500 EGP prioritize staple foods and explicitly say if adequacy is impossible; 501–1500 EGP use a balanced mix of staples, eggs, dairy, legumes, seasonal produce and some poultry/fish as feasible; 1501–4000 EGP diversify with beef, higher-quality dairy, nuts, more fruit, fish and varied produce; above 4000 EGP offer a genuinely varied higher-budget basket with options such as beef cuts, chicken, fish/seafood, salmon or tuna where locally available, Greek yogurt, nuts, olive oil, berries/imported fruit only if plausible locally, and more produce. Do not fill a high budget with only rice/lentils/eggs, but do not spend money wastefully merely to use the full budget. Avoid repeating the same shopping list across budgets. Explicitly calculate each shopping line using quantity × unit price; shopping_list total must be <= budget. Do not count consumed portion costs and full-package purchase costs as if they were the same metric; label the shopping basket total separately. Use these recent Egypt retail price references as estimates, NOT guaranteed prices: packaged rice around 35 EGP/kg (range roughly 24–45 EGP/kg in current price trackers); packaged fava beans around 63 EGP/kg; lentils around 64–69 EGP/kg; pasta around 29 EGP/kg; baladi egg around 4–6.5 EGP each; packaged milk around 46 EGP/litre; and white poultry around 89 EGP/kg in the IDSC daily update reported 26 Oct 2026. Some market reports show much higher poultry prices depending on product/channel, so label poultry prices as locally variable and never assume a low price without stating it. Reference sources: IDSC Local & Global Commodity Price Portal figures reported by Masrawy (1 Oct 2026) and Arab Finance (26 Oct 2026); values vary by shop, package, brand, region, and retail/wholesale. Derive each portion cost from these unit-price references and grams used; do not invent unrealistically cheap chicken, eggs, or cheese. Explicitly state prices are estimates and show unit-price assumptions in summary. Budget is for food the person needs to buy this week; separate the cost of full packs bought from the cost of portions consumed, and say which pantry staples are assumed available. The user's entered budget is the actual weekly cap; never round it up or display a different budget. Design portions and shopping quantities to stay within this cap when possible. If a balanced 7-day plan cannot realistically fit, return a clear summary that it is not feasible at this budget and list the realistic minimum estimate instead of generating an invented plan. Never show a shopping list whose total is higher than the budget while describing the plan as within budget. Calculate shopping list costs from the reference unit prices and quantities, and show itemized arithmetic. Do not create extreme calorie deficits or unsafe bulking plans; if age is under 18, prioritize regular balanced meals and do not prescribe weight-loss calorie restriction. Calculate meal calories and macros plausibly; totals should approximately add up from meals. Provide 5 meals/day (breakfast, snack, lunch, snack, dinner), with food names and grams/serving sizes. In each foods field, format components as a readable semicolon-separated list (e.g. "2 eggs; 2 slices baladi bread; cucumber 100 g"), never one run-on sentence. Provide 7 days exactly. Return schema: {"summary":"brief budget assumptions and caveat","days":[{"day":"Sunday","meals":[{"name":"Breakfast","foods":"...","grams":"...","calories":450,"protein":20,"carbs":55,"fat":12,"estimated_cost":25}],"calories":2200,"protein":100,"carbs":280,"fat":70,"estimated_cost":80}],"shopping_list":[{"item":"eggs","quantity":"12 eggs","estimated_cost":80}]}. All costs are EGP. Never claim a basket costs less than the budget if benchmark unit prices imply otherwise. Shopping list should show the actual quantities to purchase and estimate each line from the unit price references. Sum shopping-list costs and day costs reasonably close to the shopping budget; don't list duplicate items unnecessarily. Max 5 meals/day, 7 days, 35 shopping items. JSON only.`;
    const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(), 120000);
    let response;
    try { response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {method:"POST", signal:controller.signal, headers:{"Content-Type":"application/json","x-goog-api-key":apiKey}, body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.75,maxOutputTokens:6000}})}); }
    catch(e){ if(e?.name==="AbortError") return res.status(504).json({error:"AI meal plan took too long. Please try again."}); throw e; }
    finally { clearTimeout(timer); }
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const msg=body?.error?.message||"Unknown Gemini API error";console.error("Budget plan Gemini error:",response.status,msg);return res.status(response.status===429?429:502).json({error:response.status===429?"Gemini quota/rate limit reached. Check AI Studio quota and try later.":`Gemini meal plan request failed: ${msg}`});}
    const textOut=body?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"";
    let data; try{data=JSON.parse(textOut.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""));}catch{return res.status(502).json({error:"AI returned an unreadable meal plan. Please try again."});}
    if(!Array.isArray(data.days)||data.days.length!==7) return res.status(502).json({error:"AI did not return a complete 7-day plan. Please try again."});
    const safeNum=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100000,Math.round(n*10)/10)):0};
    data.days=data.days.slice(0,7).map((d,i)=>{const meals=(Array.isArray(d.meals)?d.meals:[]).slice(0,5).map(m=>({name:String(m.name||"Meal").slice(0,60),foods:String(m.foods||"").slice(0,500),grams:String(m.grams||"").slice(0,100),calories:safeNum(m.calories),protein:safeNum(m.protein),carbs:safeNum(m.carbs),fat:safeNum(m.fat),estimated_cost:safeNum(m.estimated_cost),notes:String(m.notes||"").slice(0,250)}));return {day:String(d.day||["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][i]).slice(0,30),meals,calories:safeNum(d.calories),protein:safeNum(d.protein),carbs:safeNum(d.carbs),fat:safeNum(d.fat),estimated_cost:safeNum(d.estimated_cost)}});
    data.shopping_list=(Array.isArray(data.shopping_list)?data.shopping_list:[]).slice(0,35).map(x=>({item:String(x.item||"Food").slice(0,100),quantity:String(x.quantity||"").slice(0,100),estimated_cost:safeNum(x.estimated_cost)}));
    data.summary=String(data.summary||"Nutrition and local prices are estimates.").slice(0,1000);
    const basketTotal = Math.round(data.shopping_list.reduce((sum,item)=>sum+safeNum(item.estimated_cost),0)*10)/10;
    const dayTotal = Math.round(data.days.reduce((sum,day)=>sum+safeNum(day.estimated_cost),0)*10)/10;
    // Refuse to present an obviously over-budget shopping basket as if it fits.
    if (data.shopping_list.length && basketTotal > budget + 0.5) {
      console.warn(`AI budget plan rejected: basket ${basketTotal} EGP exceeds cap ${budget} EGP`);
      return res.status(422).json({error:`The generated shopping basket is ${basketTotal} EGP, above your ${budget} EGP limit. Generate again or increase the budget. Prices are estimates and the plan was not accepted.`});
    }
    data.budget_check={budget,shopping_basket_estimate:basketTotal,estimated_consumed_food_cost:dayTotal,within_budget:!data.shopping_list.length || basketTotal<=budget+0.5};
    res.json(data);
  } catch(error){console.error("Budget plan error:",error?.message||error);res.status(500).json({error:"Could not generate a budget meal plan. Check the server terminal and Gemini setup."});}
});

app.get("/api/health", (_req, res) => res.json({ ok: true, aiConfigured: Boolean(apiKey), provider: "Gemini", model }));
app.listen(PORT, "0.0.0.0", () => console.log(`FitForge running at http://localhost:${PORT} (Gemini model: ${model})`));
