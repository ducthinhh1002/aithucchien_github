import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CircleHelp, Leaf, LoaderCircle, Sparkles, Utensils } from 'lucide-react';
import { emptyProfile, numericProfile, ProfileCard, validateProfile } from './profile.jsx';

function PlanResult({ plan }) {
  const [activeDay, setActiveDay] = useState(0);
  useEffect(() => setActiveDay(0), [plan]);
  const day = plan.days?.[activeDay];
  return <section className="card plan-result" aria-label="Thực đơn dự kiến">
    <div className="result-heading"><div><span className="eyebrow"><Sparkles size={14}/> THỰC ĐƠN DO AI GỢI Ý</span><h2>{plan.title}</h2></div><span className="pill orange">Khẩu phần ước lượng</span></div>
    <p className="plan-summary">{plan.summary}</p>
    {!!plan.safetyFlags?.length && <div className="danger-banner" role="alert"><div>{plan.safetyFlags.map((s,i)=><p key={i}>{s}</p>)}</div></div>}
    {!!plan.days?.length && <><div className="plan-day-tabs" role="group" aria-label="Chọn ngày trong thực đơn">{plan.days.map((d,i)=><button type="button" className={`plan-day-tab ${activeDay===i?'active':''}`} aria-pressed={activeDay===i} key={d.day} onClick={()=>setActiveDay(i)}>Ngày {d.day}</button>)}</div>
      {day && <article className="plan-day-card"><header className="plan-day-header"><h3><CalendarDays size={18}/> Ngày {day.day}</h3><span className="small-note">Định lượng dự kiến · không phải đơn ăn uống</span></header><div className="plan-meals-grid">{day.meals.map((m,i)=><section className="plan-meal-card" key={i}><h4 className="plan-meal-name"><Utensils size={17}/>{m.name}</h4>{m.time && <p className="small-note">{m.time}</p>}<ul className="plan-foods">{m.foods.map((food,j)=><li key={j}><span className="plan-food-name">{food.name}</span><span className="plan-portion">{food.portion}</span></li>)}</ul>{m.note && <p className="plan-meal-note">{m.note}</p>}</section>)}</div></article>}
    </>}
    <div className="info-note"><CircleHelp size={17}/><span>Món ăn và lượng gợi ý đều là <strong>ước lượng / chưa kiểm chứng</strong>. Nếu có dị ứng, luôn kiểm tra thành phần và nguy cơ nhiễm chéo với người chế biến; AI không bảo đảm an toàn dị ứng. Không coi thực đơn là chỉ định bắt buộc.</span></div>
    {!!plan.recommendations?.length && <><h3 className="section-title">Để thực đơn dễ theo hơn</h3><div className="tips-list">{plan.recommendations.map((tip,i)=><div className="tip-item" key={i}><Check size={17}/><p>{tip}</p></div>)}</div></>}
    {!!plan.assumptions?.length && <details><summary className="section-title">Giả định & giới hạn</summary><ul className="safety-list">{plan.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul></details>}
    {!!plan.sources?.length && <details><summary className="section-title">Tài liệu nền</summary><div className="sources-list">{plan.sources.map((s,i)=><div key={i}><a className="source-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<ArrowUpRight size={14}/></a><p className="small-note">{s.note}</p></div>)}</div></details>}
  </section>;
}

export default function MealPlanScreen({ api, configured, SafetyCard, DailyTarget }) {
  // Deliberately separate from the analysis screen: no copied profile or shared inputs.
  const [profile, setProfile] = useState(emptyProfile);
  const [preferences, setPreferences] = useState('');
  const [days, setDays] = useState('3');
  const [allergies, setAllergies] = useState('');
  const [avoidIngredients, setAvoidIngredients] = useState('');
  const [consent, setConsent] = useState(false);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null), resultRef = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function createPlan(e) {
    e.preventDefault(); setError('');
    const profileError = validateProfile(profile); if (profileError) { setError(profileError); return; }
    if (!preferences.trim()) { setError('Bạn nhập sở thích ăn uống để Nếp chọn món phù hợp nhé.'); return; }
    if (!Number.isInteger(Number(days)) || Number(days)<1 || Number(days)>7) { setError('Phạm vi thực đơn phải là số nguyên từ 1 đến 7 ngày.'); return; }
    if (!consent) { setError('Bạn cần đồng ý gửi hồ sơ và sở thích đến AI để tạo thực đơn.'); return; }
    setBusy(true); setPlan(null); const c = new AbortController(); controller.current=c;
    try {
      const data = await api('/api/meal-plan', { profile: numericProfile(profile), preferences: preferences.trim(), allergies: allergies.trim(), avoidIngredients: avoidIngredients.trim(), days: Number(days) }, c.signal);
      setPlan(data); setTimeout(()=>resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),100);
    } catch(err) { if(err.name!=='AbortError') setError(err.message); }
    finally { if(controller.current===c) setBusy(false); }
  }
  return <>
    <div className="page-intro"><span className="eyebrow"><Leaf size={14}/> LÊN BỮA NGON, HỢP LỊCH TẬP</span><h1>Bữa ăn cho bạn.</h1><p className="muted">Một thực đơn dự kiến theo thể trạng, mục tiêu, món bạn thích và thành phần bạn cần tránh. Nhập hồ sơ ngay tại đây</p></div>
    <div className="dashboard-grid"><div className="main-column">
      <form id="plan-form" noValidate className="card meal-plan-form" onSubmit={createPlan}>
        <div className="card-header"><span className="icon-box"><CalendarDays size={21}/></span><div><h2 className="card-heading">Bạn muốn ăn thế nào?</h2><p className="muted">Nếp gợi ý món và khẩu phần cho từng bữa.</p></div></div>
        <label className="field-label" htmlFor="preferences">Sở thích ăn uống <span className="required-mark">*</span></label>
        <textarea id="preferences" className="meal-input" rows={4} maxLength={1500} value={preferences} onChange={e=>setPreferences(e.target.value)} required placeholder="Ví dụ: thích món Việt, đồ nước, ít cay; ưu tiên nguyên liệu dễ mua và món nấu nhanh…"/>
        <div className="preference-chips">{['Món Việt','Món Âu','Đồ nước','Ít cay','Dễ nấu'].map(s=><button type="button" key={s} className="example-chip" onClick={()=>setPreferences(p=>p ? `${p.replace(/[,\s]+$/,'')}, ${s}` : s)}>+ {s}</button>)}</div>
        <div className="plan-settings-grid"><label className="form-field">Dị ứng thực phẩm <span className="muted">· nếu có</span><textarea name="allergies" className="form-control custom-goal-input" rows={3} maxLength={500} value={allergies} onChange={e=>setAllergies(e.target.value)} placeholder="Ví dụ: tôm, cua, lạc…"/></label><label className="form-field">Thành phần không muốn ăn <span className="muted">· nếu có</span><textarea name="avoidIngredients" className="form-control custom-goal-input" rows={3} maxLength={500} value={avoidIngredients} onChange={e=>setAvoidIngredients(e.target.value)} placeholder="Ví dụ: nội tạng, rau mùi, thịt bò…"/></label></div>
        <div className="profile-warning"><strong>Lưu ý về dị ứng:</strong> Thực đơn do AI gợi ý không thể bảo đảm món ăn không có chất gây dị ứng hoặc nhiễm chéo. Hãy xác nhận trực tiếp nguyên liệu với người nấu; nếu dị ứng nặng, hỏi chuyên gia dinh dưỡng trước khi áp dụng.</div>
        <label className="form-field" style={{display:'block',marginTop:20}}>Phạm vi thực đơn (ngày) <span className="required-mark">*</span><input name="days" className="form-control" type="number" min="1" max="7" step="1" required value={days} onChange={e=>setDays(e.target.value)}/></label>
        <div className="preference-chips">{[1,3,5,7].map(n=><button type="button" className="example-chip" aria-pressed={Number(days)===n} key={n} onClick={()=>setDays(String(n))}>{n} ngày</button>)}</div><p className="small-note">Chọn từ 1 đến 7 ngày. Thực đơn dài có thể cần thêm thời gian xử lý.</p>
        <label className="consent-line"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Tôi đồng ý gửi hồ sơ, sở thích và thông tin dị ứng/thành phần cần tránh (nếu nhập) của màn này đến dịch vụ AI của Ban tổ chức để xử lý. Không cần gửi tên hoặc bệnh án.</span></label>
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="primary-button analyze-button" disabled={busy || configured===false}>{busy?<LoaderCircle size={18} className="loading-spinner"/>:<Sparkles size={18}/>} {busy?'Nếp đang lên thực đơn…':'Tạo thực đơn cho bạn'} {!busy && <ArrowRight size={17}/>}</button>
      </form>
      {busy && <div className="card loading-card plan-progress" role="status"><LoaderCircle size={28} className="loading-spinner"/><h3>Đang chọn món hợp với bạn</h3><p className="muted">Cân đối bữa ăn · Theo sở thích · Gắn với lịch tập</p><button type="button" className="text-button" onClick={()=>{controller.current?.abort();setBusy(false);}}>Dừng tạo thực đơn</button></div>}
      <div ref={resultRef} style={{scrollMarginTop:24}}>{plan && !busy && <PlanResult plan={plan}/>}</div>
      {!plan && !busy && <div className="empty-state plan-empty"><CalendarDays size={28}/><div><strong>Không cần nghĩ “mai ăn gì?” một mình.</strong><p className="muted">Nhập hồ sơ ở bên cạnh, thêm sở thích rồi để Nếp gợi ý từng bữa cho bạn.</p></div></div>}
    </div><aside className="side-column"><ProfileCard profile={profile} setProfile={setProfile} formId="plan-form"/><DailyTarget target={plan?.dailyTarget}/><SafetyCard/></aside></div>
  </>;
}
