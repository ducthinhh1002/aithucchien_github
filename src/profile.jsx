import React from 'react';
import { LockKeyhole, Target } from 'lucide-react';

export const SPORTS = ['Tập thể hình', 'Chạy bộ', 'Đạp xe', 'Bơi lội', 'Thể thao đồng đội', 'Yoga / Pilates', 'Võ thuật', 'Môn khác'];
export const emptyProfile = () => ({ age: '', weight: '', height: '', sex: '', goal: '', activity: '', sports: [], sessionMinutes: '', customGoal: '' });
export const numericProfile = p => ({ age: Number(p.age), weight: Number(p.weight), height: Number(p.height), sex: p.sex, goal: p.goal, activity: p.activity, sports: [...p.sports], sessionMinutes: Number(p.sessionMinutes), ...(p.goal === 'custom' ? { customGoal: p.customGoal.trim() } : {}) });
export function validateProfile(p) {
  if (!p.age || !Number.isInteger(Number(p.age)) || Number(p.age) < 10 || Number(p.age) > 100) return 'Bạn nhập tuổi từ 10 đến 100 nhé.';
  if (!p.weight || Number(p.weight) < 25 || Number(p.weight) > 300) return 'Bạn nhập cân nặng từ 25 đến 300 kg nhé.';
  if (!p.height || Number(p.height) < 100 || Number(p.height) > 250) return 'Bạn nhập chiều cao từ 100 đến 250 cm nhé.';
  if (!['male', 'female'].includes(p.sex)) return 'Bạn chọn giới tính sinh học để hoàn tất hồ sơ nhé.';
  if (!p.sports?.length) return 'Bạn chọn ít nhất một môn trong “Bạn thường tập gì?” nhé.';
  if (!p.sessionMinutes || !Number.isInteger(Number(p.sessionMinutes)) || Number(p.sessionMinutes) < 10 || Number(p.sessionMinutes) > 300) return 'Bạn nhập thời gian tập mỗi buổi từ 10 đến 300 phút nhé.';
  if (!['moderate', 'high', 'very-high'].includes(p.activity)) return 'Bạn chọn mức vận động nhé.';
  if (!['maintain', 'gain', 'lose', 'custom'].includes(p.goal)) return 'Bạn chọn một mục tiêu hoặc nhập mục tiêu riêng nhé.';
  if (p.goal === 'custom' && !p.customGoal.trim()) return 'Bạn mô tả mục tiêu riêng của mình nhé.';
  return '';
}
export function ProfileCard({ profile, setProfile, formId }) {
  const change = (key, val) => setProfile(p => ({ ...p, [key]: val }));
  const toggleSport = sport => setProfile(p => ({ ...p, sports: p.sports.includes(sport) ? p.sports.filter(s => s !== sport) : [...p.sports, sport] }));
  const star = <span className="required-mark" aria-hidden="true"> *</span>;
  return <section className="card" aria-labelledby={`${formId}-profile-heading`}>
    <div className="card-header"><div className="icon-box"><Target size={20}/></div><div><h2 className="card-heading" id={`${formId}-profile-heading`}>Một chút về bạn</h2><p className="muted">Nhập đủ để gợi ý hợp với mình hơn</p></div></div>
    <p className="profile-hint">Các mục có dấu * đều bắt buộc. Chọn ít nhất một môn tập.</p>
    <div className="profile-grid">
      <label className="form-field">Tuổi{star}<input form={formId} name="age" className="form-control" type="number" min="10" max="100" step="1" value={profile.age} onChange={e => change('age', e.target.value)} placeholder="Ví dụ: 25" required/></label>
      <label className="form-field">Cân nặng (kg){star}<input form={formId} name="weight" className="form-control" type="number" min="25" max="300" step="0.1" value={profile.weight} onChange={e => change('weight', e.target.value)} placeholder="Ví dụ: 65" required/></label>
      <label className="form-field">Chiều cao (cm){star}<input form={formId} name="height" className="form-control" type="number" min="100" max="250" step="0.1" value={profile.height} onChange={e => change('height', e.target.value)} placeholder="Ví dụ: 170" required/></label>
      <label className="form-field">Giới tính sinh học{star}<select form={formId} name="sex" className="form-control" value={profile.sex} onChange={e => change('sex', e.target.value)} required><option value="" disabled>Chọn giới tính</option><option value="male">Nam</option><option value="female">Nữ</option></select></label>
      <fieldset className="sports-fieldset full-width" aria-required="true"><legend>Bạn thường tập gì?{star}</legend><div className="sports-options">{SPORTS.map((s, i) => <label className="sport-choice" key={s}><input form={formId} name="sports" type="checkbox" value={s} checked={profile.sports.includes(s)} onChange={() => toggleSport(s)} required={i === 0 && profile.sports.length === 0}/><span>{s}</span></label>)}</div><p className="small-note">Có thể chọn nhiều môn.</p></fieldset>
      <label className="form-field full-width">Thời gian tập mỗi buổi (phút){star}<input form={formId} name="sessionMinutes" className="form-control" type="number" min="10" max="300" step="1" value={profile.sessionMinutes} onChange={e => change('sessionMinutes', e.target.value)} placeholder="Ví dụ: 60" required/></label>
      <label className="form-field full-width">Mức vận động{star}<select form={formId} name="activity" className="form-control" value={profile.activity} onChange={e => change('activity', e.target.value)} required><option value="" disabled>Chọn mức vận động</option><option value="moderate">Vừa · khoảng 3–4 buổi/tuần</option><option value="high">Nhiều · khoảng 5–6 buổi/tuần</option><option value="very-high">Rất nhiều · tập nặng hằng ngày</option></select></label>
    </div>
    <fieldset className="sports-fieldset" style={{ marginTop: 20 }}><legend>Mục tiêu của bạn{star}</legend><div className="goal-options">{[['lose', 'Giảm mỡ'], ['maintain', 'Giữ thể trạng'], ['gain', 'Tăng cơ'], ['custom', 'Mục tiêu riêng']].map(([id, label]) => <label className={`goal-option ${profile.goal === id ? 'selected' : ''}`} key={id}><input form={formId} className="goal-radio" name={`${formId}-goal`} type="radio" value={id} checked={profile.goal === id} onChange={() => change('goal', id)} required/>{label}</label>)}</div></fieldset>
    {profile.goal === 'custom' && <label className="form-field full-width" style={{ display:'block', marginTop:16 }}>Mục tiêu riêng của bạn{star}<textarea form={formId} name="customGoal" className="form-control custom-goal-input" rows={3} maxLength={500} required value={profile.customGoal} onChange={e => change('customGoal', e.target.value)} placeholder="Ví dụ: duy trì sức bền cho buổi chạy dài, ăn đa dạng hơn…"/></label>}
    <p className="small-note"><LockKeyhole size={13}/> Hồ sơ chỉ ở trong phiên này, không lưu trên máy chủ.</p>
  </section>;
}
