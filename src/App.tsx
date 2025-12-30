import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import { 
  Zap, AlertTriangle, Activity, 
  LayoutDashboard, User, ShieldAlert, Crosshair, Anchor, Crown, 
  CheckCircle2, Brain, ChevronRight, LogOut, ArrowRight, 
  Smartphone, Clock, Moon, BookOpen, Dumbbell, Droplets, Sun, Sword
} from 'lucide-react';

import { signInWithRedirect, signOut, onAuthStateChanged } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { auth, googleProvider, db } from './firebaseConfig';

// --- 1. DADOS E CONFIGURAÇÕES ---

// Opções de "Sombra" (Vícios) para o usuário escolher
const VICES_OPTIONS = [
  { id: 'screens', label: 'Vício em Telas', desc: 'Redes sociais e celular roubam sua vida.', icon: Smartphone, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'procrastination', label: 'Procrastinação', desc: 'Adiar o importante gera ansiedade.', icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'content', label: 'Conteúdo Adulto', desc: 'Drena sua energia e distorce a realidade.', icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10' },
  { id: 'discipline', label: 'Falta de Rotina', desc: 'Dias caóticos sem direção clara.', icon: Crosshair, color: 'text-blue-400', bg: 'bg-blue-500/10' },
];

// Opções de "Rituais" (Bons Hábitos)
const HABITS_OPTIONS = [
  { id: 'workout', label: 'Treino Físico', icon: Dumbbell },
  { id: 'read', label: 'Leitura (15min)', icon: BookOpen },
  { id: 'meditate', label: 'Meditação', icon: Moon },
  { id: 'water', label: 'Beber 2L Água', icon: Droplets },
  { id: 'study', label: 'Estudo Focado', icon: Brain },
  { id: 'sun', label: 'Sol pela Manhã', icon: Sun },
];

const PHASES = [
  { maxDays: 7, title: "Zona de Guerra", color: "text-red-400", bg: "from-red-900/50 to-slate-900", msg: "Sobreviva ao impulso inicial.", icon: ShieldAlert },
  { maxDays: 14, title: "Campo Minado", color: "text-orange-400", bg: "from-orange-900/50 to-slate-900", msg: "Cuidado com a falsa confiança.", icon: Crosshair },
  { maxDays: 30, title: "Fortaleza", color: "text-blue-400", bg: "from-blue-900/50 to-slate-900", msg: "Reconstrução neural em andamento.", icon: Anchor },
  { maxDays: 9999, title: "Novo Normal", color: "text-emerald-400", bg: "from-emerald-900/50 to-slate-900", msg: "Sua nova identidade.", icon: Crown }
];

const RANKS = ["Iniciado", "Sobrevivente", "Guerreiro", "Estrategista", "Sentinela", "Arquiteto", "Mestre", "Lenda"];

interface UserStats {
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  streakDays: number;
  cleanDays: number;
  isDamaged: boolean;
  userName: string;
  viceId: string;       // ID do vício escolhido
  activeHabits: string[]; // IDs dos hábitos escolhidos
  onboardingCompleted: boolean;
}

interface LogEntry {
  date: string;
  type: 'success' | 'relapse' | 'habit_done';
  note?: string;
}

// --- COMPONENTE FLAME (Re-adicionado para uso interno) ---
function Flame(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.5-3.3a9 9 0 0 0 12.5-12.5c-1 .5-3 1.5-3 2.5 0 2.5-2.5 4.5-5.5 6.8z"/></svg>
  );
}

// --- 2. APLICAÇÃO PRINCIPAL ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Navegação
  const [activeTab, setActiveTab] = useState<'vice' | 'habits' | 'profile'>('vice');
  
  // Estado do Onboarding
  const [onboardingStep, setOnboardingStep] = useState(0); 
  const [tempName, setTempName] = useState("");
  const [tempVice, setTempVice] = useState("");
  const [tempHabits, setTempHabits] = useState<string[]>([]);

  // Estado dos Dados
  const [stats, setStats] = useState<UserStats>({
    level: 1, currentXP: 0, xpToNextLevel: 150, streakDays: 0, cleanDays: 0, isDamaged: false, 
    userName: "", viceId: "", activeHabits: [], onboardingCompleted: false
  });
  
  const [historyLog, setHistoryLog] = useState<LogEntry[]>([]);
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  
  // Controle de Hábitos Diários (Checklist)
  const [dailyHabitsDone, setDailyHabitsDone] = useState<string[]>([]);

  // Visuais
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRelapseModal, setShowRelapseModal] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // --- FIREBASE SYNC ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        const unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setStats({ ...data.stats });
            setHistoryLog(data.historyLog || []);
            setLastCheckIn(data.lastCheckIn);
            
            // Reseta hábitos diários se mudou o dia
            const today = new Date().toDateString();
            if (data.lastHabitReset !== today) {
              setDailyHabitsDone([]);
            } else {
              setDailyHabitsDone(data.dailyHabitsDone || []);
            }

          } else {
            // Novo usuário no banco
            const initialData = {
              stats: { level: 1, currentXP: 0, xpToNextLevel: 150, streakDays: 0, cleanDays: 0, isDamaged: false, userName: "", viceId: "", activeHabits: [], onboardingCompleted: false },
              historyLog: [],
              lastCheckIn: null,
              dailyHabitsDone: [],
              lastHabitReset: new Date().toDateString()
            };
            setDoc(userRef, initialData);
          }
          setLoading(false);
        });
        return () => unsubDoc();
      } else {
        setLoading(false);
      }
    });
    
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => { unsubscribe(); window.removeEventListener('resize', handleResize); };
  }, []);

  const saveToFirebase = async (updates: any) => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, updates, { merge: true });
  };

  // --- ACTIONS ---

  const handleLogin = async () => {
    try { await signInWithRedirect(auth, googleProvider); } 
    catch (error) { console.error("Erro", error); }
  };

  const handleLogout = () => signOut(auth);

  // Finalizar Onboarding
  const finishOnboarding = () => {
    const newStats = { 
      ...stats, 
      userName: tempName, 
      viceId: tempVice, 
      activeHabits: tempHabits,
      onboardingCompleted: true 
    };
    setStats(newStats);
    saveToFirebase({ stats: newStats });
  };

  // Vencer o Dia (Vício)
  const handleViceCheckIn = () => {
    const today = new Date().toDateString();
    if (lastCheckIn === today) return;

    let xpBase = 100; // XP alto por vencer o vício
    const newStreak = stats.streakDays + 1;
    if (stats.isDamaged) xpBase = 50;

    // Level Logic
    let newXP = stats.currentXP + xpBase;
    let newLevel = stats.level;
    let nextXP = stats.xpToNextLevel;
    if (newXP >= nextXP) {
      newXP -= nextXP;
      newLevel++;
      nextXP = Math.floor(nextXP * 1.5);
      setShowConfetti(true);
    }

    const newStats = {
      ...stats,
      level: newLevel,
      currentXP: newXP,
      xpToNextLevel: nextXP,
      streakDays: newStreak,
      cleanDays: stats.cleanDays + 1,
      isDamaged: newStreak >= 3 ? false : stats.isDamaged
    };

    setStats(newStats);
    setLastCheckIn(today);
    
    // Log
    const newLog = [{ date: today, type: 'success' as const, note: 'Venceu a Sombra' }, ...historyLog];
    setHistoryLog(newLog);

    saveToFirebase({ stats: newStats, historyLog: newLog, lastCheckIn: today });
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  };

  // Marcar Hábito Feito
  const toggleHabit = (habitId: string) => {
    const today = new Date().toDateString();
    let newDone = [...dailyHabitsDone];
    let xpGain = 0;

    if (newDone.includes(habitId)) {
      newDone = newDone.filter(id => id !== habitId); // Desmarcar (sem perder XP pra simplificar)
    } else {
      newDone.push(habitId);
      xpGain = 20; // XP por hábito
    }

    // Add XP
    let newXP = stats.currentXP + xpGain;
    let newLevel = stats.level;
    let nextXP = stats.xpToNextLevel;
    if (newXP >= nextXP) {
      newXP -= nextXP;
      newLevel++;
      nextXP = Math.floor(nextXP * 1.5);
      setShowConfetti(true);
    }

    setDailyHabitsDone(newDone);
    setStats({ ...stats, level: newLevel, currentXP: newXP, xpToNextLevel: nextXP });
    
    saveToFirebase({ 
      dailyHabitsDone: newDone, 
      lastHabitReset: today,
      stats: { ...stats, level: newLevel, currentXP: newXP, xpToNextLevel: nextXP }
    });
  };

  // Recaída
  const handleRelapse = () => {
    const today = new Date().toDateString();
    const newStats = { ...stats, streakDays: 0, isDamaged: true };
    const newLog = [{ date: today, type: 'relapse' as const, note: 'Recaída' }, ...historyLog];
    
    setStats(newStats);
    setHistoryLog(newLog);
    setLastCheckIn(null);
    setShowRelapseModal(false);
    saveToFirebase({ stats: newStats, historyLog: newLog, lastCheckIn: null });
  };

  // --- RENDER ---

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-500"><Activity className="animate-spin"/></div>;

  if (!user) {
    // TELA DE LOGIN (Simplificada)
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <Brain className="text-emerald-500 w-16 h-16 mb-6" />
        <h1 className="text-3xl font-bold text-white mb-2">Reboot Hero</h1>
        <p className="text-slate-400 mb-8">Hackeie sua dopamina. Construa rituais.</p>
        <button onClick={handleLogin} className="bg-white text-black font-bold py-3 px-8 rounded-xl flex items-center gap-2">
          Entrar com Google
        </button>
      </div>
    );
  }

  // --- FLUXO DE ONBOARDING (WIZARD) ---
  if (!stats.onboardingCompleted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/20 to-slate-950 pointer-events-none" />
        
        {onboardingStep === 0 && (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="text-center z-10 max-w-sm">
            <h1 className="text-4xl font-black mb-4">Bem-vindo ao Protocolo.</h1>
            <p className="text-slate-400 text-lg mb-8">Para começar, precisamos identificar o inimigo e escolher suas armas.</p>
            <button onClick={() => setOnboardingStep(1)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-4 px-10 rounded-2xl w-full text-lg shadow-lg shadow-emerald-500/20 transition-all">
              Iniciar Configuração
            </button>
          </motion.div>
        )}

        {onboardingStep === 1 && (
          <motion.div initial={{opacity:0, x:50}} animate={{opacity:1, x:0}} className="w-full max-w-md z-10">
            <h2 className="text-2xl font-bold mb-2">Escolha sua Sombra</h2>
            <p className="text-slate-400 text-sm mb-6">Qual vício você quer eliminar primeiro?</p>
            <div className="space-y-3">
              {VICES_OPTIONS.map((vice) => (
                <button 
                  key={vice.id}
                  onClick={() => setTempVice(vice.id)}
                  className={`w-full p-4 rounded-2xl border flex items-center gap-4 text-left transition-all ${tempVice === vice.id ? `border-${vice.color.split('-')[1]} bg-slate-800 ring-2 ring-emerald-500` : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800'}`}
                >
                  <div className={`p-3 rounded-xl ${vice.bg} ${vice.color}`}>
                    <vice.icon size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{vice.label}</h3>
                    <p className="text-xs text-slate-500">{vice.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <button disabled={!tempVice} onClick={() => setOnboardingStep(2)} className="mt-8 bg-white text-black font-bold py-4 rounded-xl w-full disabled:opacity-50">
              Continuar
            </button>
          </motion.div>
        )}

        {onboardingStep === 2 && (
          <motion.div initial={{opacity:0, x:50}} animate={{opacity:1, x:0}} className="w-full max-w-md z-10">
            <h2 className="text-2xl font-bold mb-2">Seus Rituais</h2>
            <p className="text-slate-400 text-sm mb-6">Escolha hábitos para substituir a dopamina barata.</p>
            <div className="grid grid-cols-2 gap-3">
              {HABITS_OPTIONS.map((habit) => {
                const isSelected = tempHabits.includes(habit.id);
                return (
                  <button 
                    key={habit.id}
                    onClick={() => {
                      if (isSelected) setTempHabits(tempHabits.filter(h => h !== habit.id));
                      else setTempHabits([...tempHabits, habit.id]);
                    }}
                    className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-3 text-center transition-all ${isSelected ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/50'}`}
                  >
                    <habit.icon size={28} className={isSelected ? 'text-emerald-400' : 'text-slate-500'} />
                    <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-400'}`}>{habit.label}</span>
                  </button>
                )
              })}
            </div>
            <button disabled={tempHabits.length === 0} onClick={() => setOnboardingStep(3)} className="mt-8 bg-white text-black font-bold py-4 rounded-xl w-full disabled:opacity-50">
              Continuar
            </button>
          </motion.div>
        )}

        {onboardingStep === 3 && (
          <motion.div initial={{opacity:0, x:50}} animate={{opacity:1, x:0}} className="w-full max-w-md z-10 text-center">
            <h2 className="text-2xl font-bold mb-6">Como devemos te chamar?</h2>
            <input 
              type="text" 
              placeholder="Seu nome"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-center text-xl focus:border-emerald-500 outline-none mb-6"
            />
            <button disabled={!tempName} onClick={finishOnboarding} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-4 rounded-xl w-full text-lg shadow-lg shadow-emerald-500/20">
              Começar Jornada
            </button>
          </motion.div>
        )}
      </div>
    )
  }

  // --- APP DASHBOARD ---
  
  const currentPhase = PHASES.find(p => stats.streakDays <= p.maxDays) || PHASES[PHASES.length - 1];
  const rankIndex = Math.min(stats.level - 1, RANKS.length - 1);
  const selectedVice = VICES_OPTIONS.find(v => v.id === stats.viceId) || VICES_OPTIONS[0];

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24 font-sans selection:bg-emerald-500/30">
      {showConfetti && <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={400}/>}
      
      {/* HEADER FIXO */}
      <header className="p-6 pb-2 flex justify-between items-start bg-gradient-to-b from-slate-900 to-slate-950 sticky top-0 z-20 border-b border-slate-800/50">
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Patente: {RANKS[rankIndex]}</h2>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">Nível {stats.level}</span>
            <div className="h-1.5 w-24 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{width: `${(stats.currentXP / stats.xpToNextLevel) * 100}%`}}></div>
            </div>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white"><LogOut size={16}/></button>
      </header>

      <main className="p-6 space-y-8">
        
        {/* === ABA 1: A SOMBRA (VÍCIO) === */}
        {activeTab === 'vice' && (
          <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="space-y-6">
            
            <div className={`p-6 rounded-3xl border relative overflow-hidden ${stats.isDamaged ? 'bg-red-950/20 border-red-900/50' : 'bg-slate-900 border-slate-800'}`}>
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <selectedVice.icon className={stats.isDamaged ? 'text-red-500' : selectedVice.color} size={20} />
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">{selectedVice.label}</span>
                  </div>
                  <h1 className="text-5xl font-black text-white mb-2">{stats.streakDays} <span className="text-xl text-slate-500 font-medium">dias</span></h1>
                  <p className="text-sm text-slate-400">{stats.isDamaged ? "Armadura danificada. Reinicie." : currentPhase.msg}</p>
                </div>
                {stats.isDamaged ? <AlertTriangle className="text-red-500" size={32}/> : <Crown className="text-yellow-500" size={32}/>}
              </div>
            </div>

            <button 
              disabled={lastCheckIn === new Date().toDateString()}
              onClick={handleViceCheckIn}
              className={`w-full h-24 rounded-2xl flex items-center justify-between px-8 transition-all shadow-xl group border
                ${lastCheckIn 
                  ? 'bg-slate-900 border-slate-800 opacity-60 cursor-default' 
                  : stats.isDamaged
                    ? 'bg-red-900/20 border-red-500/50 text-red-100 hover:bg-red-900/30'
                    : 'bg-emerald-600 border-emerald-500 hover:bg-emerald-500'}`}
            >
              <div>
                <h3 className="text-xl font-bold uppercase">{lastCheckIn ? 'Missão Cumprida' : (stats.isDamaged ? 'Reiniciar Contagem' : 'Vencer o Dia')}</h3>
                <p className="text-xs opacity-70 font-medium tracking-wider">{lastCheckIn ? 'Volte amanhã' : '+100 XP'}</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${lastCheckIn ? 'bg-emerald-500/20' : 'bg-white/20'}`}>
                {lastCheckIn ? <CheckCircle2 /> : <Sword fill="currentColor" />}
              </div>
            </button>

            {!stats.isDamaged && !lastCheckIn && (
              <p className="text-center text-xs text-slate-500 mt-4">
                "A batalha mais difícil é contra você mesmo."
              </p>
            )}
          </motion.div>
        )}

        {/* === ABA 2: RITUAIS (HÁBITOS) === */}
        {activeTab === 'habits' && (
          <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-4">Rituais Diários</h2>
            
            {stats.activeHabits.length === 0 ? (
              <p className="text-slate-500 text-center">Nenhum ritual configurado.</p>
            ) : (
              stats.activeHabits.map(habitId => {
                const habitData = HABITS_OPTIONS.find(h => h.id === habitId);
                if (!habitData) return null;
                const isDone = dailyHabitsDone.includes(habitId);

                return (
                  <button 
                    key={habitId}
                    onClick={() => toggleHabit(habitId)}
                    className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${isDone ? 'bg-slate-900/50 border-emerald-500/30 opacity-70' : 'bg-slate-800 border-slate-700 hover:bg-slate-750'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl ${isDone ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-700 text-slate-400'}`}>
                        <habitData.icon size={20} />
                      </div>
                      <span className={`font-bold ${isDone ? 'text-slate-400 line-through' : 'text-white'}`}>{habitData.label}</span>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isDone ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-slate-600'}`}>
                      {isDone && <CheckCircle2 size={14} />}
                    </div>
                  </button>
                )
              })
            )}
            
            <p className="text-center text-xs text-slate-500 mt-6">
              Rituais resetam automaticamente à meia-noite.
            </p>
          </motion.div>
        )}

        {/* === ABA 3: PAINEL (PROFILE) === */}
        {activeTab === 'profile' && (
          <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="space-y-6">
            <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full mx-auto flex items-center justify-center text-2xl font-bold mb-4 shadow-lg shadow-purple-500/20">
                {stats.userName.charAt(0)}
              </div>
              <h2 className="text-2xl font-bold text-white">{stats.userName}</h2>
              <p className="text-emerald-400 font-bold text-sm uppercase tracking-widest mt-1">{RANKS[rankIndex]}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center">
                <span className="text-slate-500 text-xs font-bold uppercase">Dias Limpos</span>
                <p className="text-2xl font-bold text-white">{stats.cleanDays}</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center">
                <span className="text-slate-500 text-xs font-bold uppercase">XP Total</span>
                <p className="text-2xl font-bold text-cyan-400">{stats.currentXP}</p>
              </div>
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl border border-red-900/20 mt-8">
              <h3 className="text-red-400 font-bold text-sm flex items-center gap-2 mb-2"><AlertTriangle size={16}/> Zona de Honestidade</h3>
              <p className="text-slate-500 text-xs mb-4">Caiu? Registre aqui para ajustar a rota. Não é o fim.</p>
              <button onClick={() => setShowRelapseModal(true)} className="w-full py-3 border border-red-500/30 text-red-500 rounded-xl text-xs font-bold uppercase hover:bg-red-950/30">
                Registrar Queda
              </button>
            </div>
          </motion.div>
        )}

      </main>

      {/* --- MENU INFERIOR --- */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-full px-2 py-2 flex items-center gap-1 shadow-2xl z-30">
        <button onClick={() => setActiveTab('vice')} className={`p-3 rounded-full transition-all ${activeTab === 'vice' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:text-white'}`}>
          <ShieldAlert size={24} />
        </button>
        <button onClick={() => setActiveTab('habits')} className={`p-3 rounded-full transition-all ${activeTab === 'habits' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:text-white'}`}>
          <CheckCircle2 size={24} />
        </button>
        <button onClick={() => setActiveTab('profile')} className={`p-3 rounded-full transition-all ${activeTab === 'profile' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:text-white'}`}>
          <User size={24} />
        </button>
      </nav>

      {/* MODAL DE RECAÍDA */}
      {showRelapseModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4">
           <motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-xs w-full shadow-2xl">
              <h3 className="text-white font-bold text-lg mb-2">Confirmar Queda?</h3>
              <p className="text-slate-400 text-xs mb-6">Reiniciaremos sua sequência do Vício, mas seu Nível e Dias Totais serão mantidos.</p>
              <div className="flex gap-3">
                 <button onClick={() => setShowRelapseModal(false)} className="flex-1 py-3 bg-slate-800 rounded-xl text-white text-sm font-bold">Cancelar</button>
                 <button onClick={handleRelapse} className="flex-1 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm font-bold">Confirmar</button>
              </div>
           </motion.div>
        </div>
      )}
    </div>
  );
}