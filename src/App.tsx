import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import { 
  Zap, AlertTriangle, Activity, 
  LayoutDashboard, User, Edit3, ShieldAlert, Crosshair, Anchor, Crown, 
  CheckCircle2, PauseCircle, Save, X, Brain, ChevronRight, LogOut, ArrowRight, Users
} from 'lucide-react';

import { signInWithRedirect, signOut, onAuthStateChanged } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { auth, googleProvider, db } from './firebaseConfig';

// --- 1. CONFIGURAÇÕES E DADOS ---

const PHASES = [
  { 
    id: 'war_zone',
    maxDays: 7, 
    title: "Zona de Guerra", 
    color: "text-red-400", 
    bg: "from-red-900/50 to-slate-900", 
    msg: "Seu cérebro está aprendendo a resistir.",
    neuroChange: "A dopamina caiu drasticamente. A irritação é normal, é o cérebro pedindo a droga. Respire.",
    icon: ShieldAlert
  },
  { 
    id: 'mine_field',
    maxDays: 14, 
    title: "Campo Minado", 
    color: "text-orange-400", 
    bg: "from-orange-900/50 to-slate-900", 
    msg: "A confiança voltou, mas o perigo não sumiu.",
    neuroChange: "Os receptores começam a 'desgrudar'. Você sente clareza, mas gatilhos antigos ainda são fortes.",
    icon: Crosshair
  },
  { 
    id: 'fortress',
    maxDays: 30, 
    title: "Fortaleza", 
    color: "text-blue-400", 
    bg: "from-blue-900/50 to-slate-900", 
    msg: "Você está no comando do próprio tédio.",
    neuroChange: "Novas sinapses estão se formando. O hábito antigo está fisicamente perdendo conexão.",
    icon: Anchor
  },
  { 
    id: 'new_normal',
    maxDays: 9999, 
    title: "Novo Normal", 
    color: "text-emerald-400", 
    bg: "from-emerald-900/50 to-slate-900", 
    msg: "Sua identidade é mais forte que o impulso.",
    neuroChange: "Homeostase atingida. A disciplina deixou de ser esforço e virou natural.",
    icon: Crown
  }
];

const RANKS = ["Iniciado", "Sobrevivente", "Guerreiro", "Estrategista", "Sentinela", "Arquiteto", "Mestre", "Lenda"];
const MILESTONES = [3, 7, 14, 21, 30, 60, 90];

const RANK_QUOTES: Record<number, string[]> = {
  0: ["Você está no comando.", "A inércia foi quebrada.", "Biologia não é destino."],
  1: ["Suportar é vencer.", "A dor é passageira.", "Mantenha a guarda alta."],
  2: ["Corte o mal pela raiz.", "Disciplina é liberdade.", "Não negocie com o vício."],
  3: ["Antecipe o inimigo.", "Ocupe sua mente.", "Domine o ambiente."],
  4: ["Vigilância eterna.", "O silêncio é seu amigo.", "Proteja seu progresso."],
  5: ["Construindo o novo eu.", "Cada não é um tijolo.", "Arquitetura mental."],
  6: ["Você escolhe, não reage.", "Voo de cruzeiro.", "Inspire pelo exemplo."],
  7: ["Imparável.", "Legado vivo.", "Mestria total."]
};

interface UserStats {
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  streakDays: number;
  cleanDays: number;
  isDamaged: boolean;
  habitName: string;
  userName?: string; // NOVO CAMPO
}

interface LogEntry {
  date: string;
  type: 'success' | 'relapse';
  note?: string;
}

// --- 2. APLICAÇÃO PRINCIPAL ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'home' | 'habit'>('home');
  const [isEditingHabit, setIsEditingHabit] = useState(false);
  const [tempHabitName, setTempHabitName] = useState("");
  
  // Estado para o input de nome no Onboarding
  const [inputName, setInputName] = useState("");
  
  const [stats, setStats] = useState<UserStats>({
    level: 1, currentXP: 0, xpToNextLevel: 150, streakDays: 0, cleanDays: 0, isDamaged: false, habitName: "Protocolo Reboot", userName: ""
  });
  
  const [historyLog, setHistoryLog] = useState<LogEntry[]>([]);
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRelapseModal, setShowRelapseModal] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [showRipple, setShowRipple] = useState(false);
  const [dailyMessage, setDailyMessage] = useState<string>("");

  // --- GERENCIAMENTO DE LOGIN E DADOS ---
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        
        const unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Garante que o objeto stats tenha todos os campos, mesmo se vier antigo do banco
            setStats({ ...data.stats, userName: data.stats.userName || "" });
            setHistoryLog(data.historyLog || []);
            setLastCheckIn(data.lastCheckIn);
          } else {
            const initialData = {
              stats: { level: 1, currentXP: 0, xpToNextLevel: 150, streakDays: 0, cleanDays: 0, isDamaged: false, habitName: "Protocolo Reboot", userName: "" },
              historyLog: [],
              lastCheckIn: null
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
    
    return () => {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const saveToFirebase = async (newStats: UserStats, newLog: LogEntry[], newCheckIn: string | null) => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      stats: newStats,
      historyLog: newLog,
      lastCheckIn: newCheckIn
    }, { merge: true });
  };

  const handleLogin = async () => {
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error("Erro ao logar", error);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- LÓGICA DE SALVAR NOME (ONBOARDING) ---
  const handleSaveProfile = () => {
    if (!inputName.trim()) return;
    const newStats = { ...stats, userName: inputName };
    setStats(newStats);
    saveToFirebase(newStats, historyLog, lastCheckIn);
  };

  // --- LÓGICA DO APP ---

  const currentPhase = PHASES.find(p => stats.streakDays <= p.maxDays) || PHASES[PHASES.length - 1];
  const rankIndex = Math.min(stats.level - 1, RANKS.length - 1);
  const rankTitle = RANKS[rankIndex];
  const isNextMilestone = MILESTONES.includes(stats.streakDays + 1);
  const PhaseIcon = currentPhase.icon;
  const phaseProgress = (Math.min(stats.streakDays, currentPhase.maxDays) / currentPhase.maxDays) * 100;

  const getDailyQuote = (day: number, rankIdx: number, isRecovery: boolean) => {
    if (isRecovery) return "Sistemas reiniciados. Levante-se.";
    const possibleQuotes = RANK_QUOTES[rankIdx] || RANK_QUOTES[0];
    return possibleQuotes[day % possibleQuotes.length];
  };

  const handleDailyCheckIn = () => {
    const today = new Date().toDateString();
    if (lastCheckIn === today) return;

    const isRecoveryAction = stats.streakDays === 0;
    const newStreak = stats.streakDays + 1;
    const message = getDailyQuote(newStreak, rankIndex, isRecoveryAction);
    setDailyMessage(message);

    let xpBase = 50;
    let shouldShowConfetti = false;

    if (currentPhase.id === 'war_zone') { xpBase = 75; shouldShowConfetti = true; }
    if (isNextMilestone) { xpBase += 500; shouldShowConfetti = true; }

    if (shouldShowConfetti) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), currentPhase.id === 'war_zone' ? 3000 : 8000);
    } else {
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 1000);
    }

    if (stats.isDamaged) xpBase = Math.floor(xpBase / 2);

    const newLog = [{ date: today, type: 'success' as const, note: `Dia ${newStreak}` }, ...historyLog];
    
    let newXP = stats.currentXP + xpBase;
    let newLevel = stats.level;
    let nextXP = stats.xpToNextLevel;

    if (newXP >= nextXP) {
      newXP = newXP - nextXP;
      newLevel++;
      nextXP = Math.floor(nextXP * 1.5);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 8000);
    }

    const newStats = {
      ...stats,
      level: newLevel,
      currentXP: newXP,
      xpToNextLevel: nextXP,
      streakDays: newStreak,
      cleanDays: stats.cleanDays + 1,
      isDamaged: stats.streakDays >= 2 ? false : stats.isDamaged 
    };

    setStats(newStats);
    setHistoryLog(newLog);
    setLastCheckIn(today);
    
    saveToFirebase(newStats, newLog, today);
  };

  const handleRelapse = () => {
    const today = new Date().toDateString();
    const newLog = [{ date: today, type: 'relapse' as const, note: 'Ajuste de rota.' }, ...historyLog];
    
    const newStats = { ...stats, streakDays: 0, isDamaged: true };

    setStats(newStats);
    setHistoryLog(newLog);
    setShowRelapseModal(false);
    setLastCheckIn(null);
    setDailyMessage("");

    saveToFirebase(newStats, newLog, null);
  };

  const saveHabitName = () => {
    if (tempHabitName.trim()) {
      const newStats = { ...stats, habitName: tempHabitName };
      setStats(newStats);
      saveToFirebase(newStats, historyLog, lastCheckIn);
    }
    setIsEditingHabit(false);
  };

  const startEditing = () => {
    setTempHabitName(stats.habitName);
    setIsEditingHabit(true);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <Activity size={32} className="text-emerald-500 animate-spin" />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Sincronizando...</p>
      </div>
    </div>;
  }

  // TELA DE LOGIN
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-900/20 to-slate-900 opacity-50 z-0"></div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-sm bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-8 rounded-3xl text-center shadow-2xl"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
            <Brain className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Reboot Hero</h1>
          <p className="text-slate-400 mb-8 text-sm">Assuma o controle da sua dopamina. Gamifique sua liberdade.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Entrar com Google
          </button>
          <p className="text-xs text-slate-500 mt-4">Seus dados salvos na nuvem, seguros e privados.</p>
        </motion.div>
      </div>
    );
  }

  // --- TELA DE ONBOARDING (Se já logou, mas não tem nome) ---
  if (!stats.userName) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-900/10 to-slate-900 opacity-50 z-0"></div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-full max-w-md"
        >
          <div className="mb-8 text-center">
            <div className="w-20 h-20 bg-slate-800 rounded-full mx-auto flex items-center justify-center mb-6 border border-slate-700 animate-pulse">
              <Users className="text-emerald-400" size={36} />
            </div>
            <h1 className="text-3xl font-black text-white mb-3">Você não está sozinho.</h1>
            <p className="text-slate-400 text-base leading-relaxed">
              Existe uma legião silenciosa lutando contra o vício digital. <br/>
              Aqui, nós não julgamos. Nós reconstruímos.
            </p>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-md border border-slate-700 p-6 rounded-3xl shadow-xl">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-3">Iniciando Protocolo</label>
            <p className="text-white text-lg font-medium mb-4">Como você quer ser chamado?</p>
            
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Seu nome ou apelido"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveProfile()}
              />
              <button 
                onClick={handleSaveProfile}
                disabled={!inputName.trim()}
                className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold p-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight size={24} />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- APP PRINCIPAL (DASHBOARD) ---
  return (
    <div className={`min-h-screen font-sans flex flex-col items-center justify-start p-4 pb-28 relative overflow-hidden transition-colors duration-1000 ${stats.isDamaged ? 'bg-zinc-900 grayscale' : 'bg-slate-900'} text-white`}>
      
      {/* Background Dinâmico */}
      <div className={`absolute top-0 left-0 w-full h-full overflow-hidden -z-10 transition-opacity duration-1000 ${stats.isDamaged ? 'opacity-0' : 'opacity-100'}`}>
        <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-br ${currentPhase.bg} opacity-20`}></div>
      </div>

      {showConfetti && <Confetti width={windowSize.width} height={windowSize.height} numberOfPieces={300} recycle={false} gravity={0.2} />}

      <main className="w-full max-w-md md:max-w-5xl space-y-8 mt-2">
        
        {/* --- TELA 1: HOJE --- */}
        {activeTab === 'home' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <header className="text-center space-y-2 relative">
               <button onClick={handleLogout} className="absolute right-0 top-0 w-8 h-8 rounded-full overflow-hidden border border-white/20 hover:border-white/50 transition-colors bg-slate-800 flex items-center justify-center">
                  {user.photoURL ? <img src={user.photoURL} alt="User" /> : <User size={16} />}
               </button>

              <div className="inline-flex items-center gap-2 bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-700/50 backdrop-blur-md">
                 <div className={`w-2 h-2 rounded-full ${stats.isDamaged ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                 <span className={`text-xs font-bold uppercase tracking-widest ${currentPhase.color}`}>
                    {stats.isDamaged ? "RECUPERAÇÃO" : currentPhase.title}
                 </span>
              </div>
              
              <div className="mt-4">
                <p className="text-slate-400 text-sm mb-1">Olá, <span className="text-white font-bold">{stats.userName}</span></p>
                <h1 className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">
                  Dia {stats.streakDays + (lastCheckIn === new Date().toDateString() ? 0 : 1)}
                </h1>
              </div>
              
              <p className="text-slate-400 font-medium text-sm max-w-[80%] mx-auto leading-relaxed">
                "{stats.isDamaged ? "Cure a ferida." : currentPhase.msg}"
              </p>
            </header>

            <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 relative overflow-hidden">
               <div className="flex justify-between items-end mb-3 relative z-10">
                 <div>
                   <span className="text-slate-400 text-xs font-bold uppercase tracking-widest block mb-1">Próximo Marco</span>
                   <span className="text-xl font-bold text-white">
                      {stats.streakDays} <span className="text-slate-500 text-sm font-normal">de {currentPhase.maxDays} dias</span>
                   </span>
                 </div>
                 <PhaseIcon className={`${currentPhase.color} opacity-80`} size={28} />
               </div>
               <div className="h-4 bg-slate-900/50 rounded-full overflow-hidden relative z-10">
                 <motion.div initial={{ width: 0 }} animate={{ width: `${phaseProgress}%` }} className={`h-full ${stats.isDamaged ? 'bg-red-500' : 'bg-gradient-to-r from-emerald-400 to-cyan-500'}`} />
               </div>
               <p className="text-xs text-slate-500 mt-3 relative z-10">
                 {stats.isDamaged ? "Reinicie a contagem para voltar à fase." : "Você já passou pela parte mais instável."}
               </p>
            </div>

            {!stats.isDamaged && (
              <div className="space-y-3">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">O que muda agora</h3>
                 <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex gap-4 items-start">
                    <Brain className="text-purple-400 shrink-0 mt-1" size={20} />
                    <div>
                      <h4 className="text-white font-bold text-sm mb-1">Ajuste Neural em Andamento</h4>
                      <p className="text-slate-400 text-sm leading-relaxed">{currentPhase.neuroChange}</p>
                    </div>
                 </div>
              </div>
            )}

            <motion.button
              disabled={lastCheckIn === new Date().toDateString()}
              whileHover={!lastCheckIn ? { scale: 1.02 } : {}}
              whileTap={!lastCheckIn ? { scale: 0.95 } : {}}
              onClick={handleDailyCheckIn}
              className={`relative w-full h-24 rounded-2xl overflow-hidden group transition-all border flex items-center justify-between px-8 shadow-xl
                ${lastCheckIn 
                   ? 'bg-slate-800 border-slate-700 cursor-default opacity-80' 
                   : stats.isDamaged
                     ? 'bg-gradient-to-r from-red-900 to-slate-900 border-red-700 animate-pulse'
                     : 'bg-gradient-to-r from-emerald-600 to-teal-800 border-emerald-500 shadow-emerald-900/20'
                }`}
            >
               <AnimatePresence>
                  {showRipple && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0.5 }} animate={{ scale: 2, opacity: 0 }} exit={{ opacity: 0 }}
                      className="absolute bg-white rounded-full pointer-events-none left-1/2 top-1/2 w-40 h-40 -translate-x-1/2 -translate-y-1/2"
                    />
                  )}
                </AnimatePresence>
               <div className="relative z-10">
                 <h3 className="text-xl font-black text-white uppercase tracking-tight">
                   {lastCheckIn ? "Missão Cumprida" : (stats.isDamaged ? "Reiniciar" : "Vencer o Dia")}
                 </h3>
                 <p className={`text-xs font-bold uppercase tracking-wider ${stats.isDamaged ? 'text-red-200' : 'text-emerald-100'}`}>
                   {lastCheckIn ? "Volte amanhã" : "+50 XP de Disciplina"}
                 </p>
               </div>
               <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center ${lastCheckIn ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/20 text-white'}`}>
                 {lastCheckIn ? <CheckCircle2 size={24} /> : <Zap size={24} fill="currentColor" />}
               </div>
            </motion.button>

            {/* Renderizar dailyMessage apenas se houver uma mensagem */}
            {dailyMessage && (
               <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center">
                   <p className="text-emerald-400 text-sm font-bold">"{dailyMessage}"</p>
               </motion.div>
            )}

            <p className="text-center text-xs text-slate-500 font-medium">
              Você está fazendo exatamente o que precisa fazer hoje.
            </p>
          </motion.div>
        )}

        {/* --- TELA 2: HÁBITO --- */}
        {activeTab === 'habit' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            
            <header className="pb-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">Painel de Controle</h1>
                <p className="text-slate-400 text-sm">Gestão deliberada do protocolo.</p>
              </div>
              <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1">
                <LogOut size={14} /> Sair
              </button>
            </header>

            <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700">
               <div className="flex justify-between items-start mb-2">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hábito Ativo</span>
                 <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                   <Activity size={10} className="text-emerald-400 animate-pulse" />
                   <span className="text-[10px] font-bold text-emerald-400 uppercase">Em Andamento</span>
                 </div>
               </div>
               
               {isEditingHabit ? (
                 <div className="mt-2 space-y-3">
                   <input 
                     autoFocus
                     type="text" 
                     value={tempHabitName}
                     onChange={(e) => setTempHabitName(e.target.value)}
                     className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                   />
                   <div className="flex gap-2">
                     <button onClick={saveHabitName} className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"><Save size={14}/> Salvar</button>
                     <button onClick={() => setIsEditingHabit(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"><X size={14}/> Cancelar</button>
                   </div>
                   <p className="text-[10px] text-orange-400 flex items-center gap-1 mt-1">
                     <AlertTriangle size={10} /> Mudanças frequentes dificultam a consolidação neural.
                   </p>
                 </div>
               ) : (
                 <h2 className="text-xl font-bold text-white mt-1">{stats.habitName}</h2>
               )}
            </div>

            <div className="grid grid-cols-3 gap-3">
               <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 text-center">
                 <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Dias Totais</span>
                 <span className="text-lg font-bold text-white">{stats.cleanDays}</span>
               </div>
               <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 text-center">
                 <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Fase</span>
                 <span className={`text-lg font-bold ${currentPhase.color}`}>{currentPhase.title.split(' ')[0]}</span>
               </div>
               <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 text-center">
                 <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Patente</span>
                 <span className="text-lg font-bold text-white">{rankTitle}</span>
               </div>
            </div>

            <div className="space-y-3 pt-2">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Ações do Protocolo</h3>
               
               <button 
                 onClick={() => setShowRelapseModal(true)}
                 className="w-full flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:bg-slate-800 transition-colors group"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-red-500/10 p-2 rounded-lg text-red-500 group-hover:bg-red-500 group-hover:text-white transition-colors">
                     <AlertTriangle size={18} />
                   </div>
                   <span className="text-sm font-bold text-slate-300 group-hover:text-white">Registrar Queda de Sinal</span>
                 </div>
                 <ChevronRight size={16} className="text-slate-600" />
               </button>

               {!isEditingHabit && (
                 <button 
                   onClick={startEditing}
                   className="w-full flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:bg-slate-800 transition-colors group"
                 >
                   <div className="flex items-center gap-3">
                     <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                       <Edit3 size={18} />
                     </div>
                     <span className="text-sm font-bold text-slate-300 group-hover:text-white">Editar Nome do Hábito</span>
                   </div>
                   <ChevronRight size={16} className="text-slate-600" />
                 </button>
               )}

               <button 
                 onClick={() => alert("Funcionalidade futura.")}
                 className="w-full flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:bg-slate-800 transition-colors group opacity-60"
               >
                 <div className="flex items-center gap-3">
                   <div className="bg-yellow-500/10 p-2 rounded-lg text-yellow-500">
                     <PauseCircle size={18} />
                   </div>
                   <span className="text-sm font-bold text-slate-400">Pausar Desafio</span>
                 </div>
                 <span className="text-[10px] font-bold uppercase bg-slate-800 px-2 py-1 rounded text-slate-500">Em Breve</span>
               </button>
            </div>
          </motion.div>
        )}

      </main>

      {/* MENU INFERIOR */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-1.5 flex items-center gap-1 shadow-2xl z-40">
        <button 
          onClick={() => setActiveTab('home')}
          className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${activeTab === 'home' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <LayoutDashboard size={20} />
          <span className="text-xs font-bold uppercase tracking-wide">Hoje</span>
        </button>
        <button 
          onClick={() => setActiveTab('habit')}
          className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${activeTab === 'habit' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <User size={20} />
          <span className="text-xs font-bold uppercase tracking-wide">Hábito</span>
        </button>
      </div>

      {/* MODAL DE RECAÍDA */}
      {showRelapseModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4">
           <motion.div initial={{scale: 0.95, opacity: 0}} animate={{scale: 1, opacity: 1}} className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-xs w-full shadow-2xl">
              <h3 className="text-white font-bold text-lg mb-2">Ajuste de Rota</h3>
              <p className="text-slate-400 text-xs mb-6 leading-relaxed">
                  Sem culpa. O sistema manterá seu Nível e Dias Totais. Reiniciaremos apenas a sequência atual.
              </p>
              <div className="flex gap-3">
                 <button onClick={() => setShowRelapseModal(false)} className="flex-1 py-3 bg-slate-800 rounded-xl text-white text-sm font-bold">Voltar</button>
                 <button onClick={handleRelapse} className="flex-1 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm font-bold">Confirmar</button>
              </div>
           </motion.div>
        </div>
      )}
    </div>
  );
}