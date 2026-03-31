/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse, ThinkingLevel, Modality } from "@google/genai";
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  BookOpen, 
  BrainCircuit, 
  ChevronRight, 
  Loader2,
  AlertCircle,
  Sparkles,
  LayoutDashboard,
  LogOut,
  User,
  History,
  TrendingUp,
  Code,
  LineChart as LineChartIcon,
  Activity,
  Trash2,
  Download,
  Zap,
  Target,
  Video,
  Copy,
  ExternalLink,
  Check,
  Award,
  Image as ImageIcon,
  Maximize,
  Minimize,
  Search,
  MessageSquare,
  Send,
  UserCircle,
  Settings,
  Plus,
  ArrowLeft,
  Info,
  History as HistoryIcon,
  Play,
  Film
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

import { auth, db } from './firebase';

// --- Types & Interfaces ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to clean JSON from Gemini response
function cleanJson(text: string): any {
  try {
    // Remove markdown code blocks if present
    const cleaned = text.replace(/```json\n?|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('JSON Parse Error:', e, 'Raw text:', text);
    throw new Error('Invalid analysis format.');
  }
}

interface Question {
  id: number;
  docId?: string;
  subject: string;
  syllabusCategory?: string; // ECET Syllabus Category
  marks?: number;
  question: string;
  correctAnswer: string;
  explanation: string;
  visualizationHint: string;
  infographicUrl?: string;
  imagePrompt?: string;
  videoUrl?: string;
  videoPrompt?: string;
  extraResources?: string[];
  visualizationData?: {
    type: 'graph' | 'steps' | 'logic';
    data: any[];
    config?: any;
  };
  isCorrect?: boolean;
  deepDive?: string;
}

interface QuizAnalysis {
  id?: string;
  userId: string;
  fileName: string;
  timestamp: string;
  totalQuestionsFound?: number;
  totalMarks?: number;
  questions?: Question[];
  overallSummary: string;
  topSubject?: string;
  stats?: {
    total: number;
    correct: number;
    wrong: number;
  };
}

// --- Visualization Components ---

const GraphVisualizer = ({ data, config }: { data: any[], config?: any }) => {
  return (
    <div className="h-64 w-full mt-4 bg-white/5 rounded-xl p-4 border border-white/10">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="x" stroke="#888" fontSize={12} />
          <YAxis stroke="#888" fontSize={12} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
            itemStyle={{ color: '#3b82f6' }}
          />
          <Area 
            type="monotone" 
            dataKey="y" 
            stroke="#3b82f6" 
            fillOpacity={1} 
            fill="url(#colorVal)" 
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
      {config?.label && (
        <p className="text-center text-[10px] text-gray-500 mt-2 uppercase tracking-widest font-bold">
          {config.label}
        </p>
      )}
    </div>
  );
};

const StepsVisualizer = ({ steps }: { steps: string[] }) => {
  return (
    <div className="mt-4 space-y-3">
      {steps.map((step, i) => (
        <motion.div 
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex gap-3 items-start group"
        >
          <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 group-hover:bg-blue-500 group-hover:text-white transition-colors">
            {i + 1}
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{step}</p>
        </motion.div>
      ))}
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'home' | 'dashboard' | 'analysis' | 'ai-studio'>('home');
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState<string>('');
  const [manualTitle, setManualTitle] = useState<string>('');
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDeepDiving, setIsDeepDiving] = useState<number | null>(null);
  const [deepDiveResult, setDeepDiveResult] = useState<{id: number, content: string} | null>(null);
  const [analysis, setAnalysis] = useState<QuizAnalysis | null>(null);
  const [pastAnalyses, setPastAnalyses] = useState<QuizAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analysisToDelete, setAnalysisToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom Regeneration State
  const [customRegenQuestion, setCustomRegenQuestion] = useState<Question | null>(null);
  const [customRegenPrompt, setCustomRegenPrompt] = useState<string>('');
  const [customRegenImage, setCustomRegenImage] = useState<File | null>(null);
  const [isCustomRegenerating, setIsCustomRegenerating] = useState(false);
  const customRegenImageInputRef = useRef<HTMLInputElement>(null);

  // AI Studio State
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [studioImagePrompt, setStudioImagePrompt] = useState('');
  const [studioImageSize, setStudioImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [studioImageAspectRatio, setStudioImageAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [studioVideoPrompt, setStudioVideoPrompt] = useState('');
  const [studioVideoAspectRatio, setStudioVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [studioTab, setStudioTab] = useState<'chat' | 'image' | 'video'>('chat');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Ensure user profile exists in Firestore
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            createdAt: new Date().toISOString()
          });
        }

        // Fetch past analyses
        const q = query(
          collection(db, 'users', user.uid, 'analyses'),
          orderBy('timestamp', 'desc')
        );
        onSnapshot(q, (snapshot) => {
          const analyses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizAnalysis));
          setPastAnalyses(analyses);
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to sign in with Google.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setView('home');
      setPastAnalyses([]);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const [generatingInfographics, setGeneratingInfographics] = useState<Record<string, boolean>>({});
  const [generatingVideos, setGeneratingVideos] = useState<Record<string, boolean>>({});

  // --- AI Studio Functions ---

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user' as const, text: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatting(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const chat = ai.chats.create({
        model: "gemini-3.1-pro-preview",
        config: {
          systemInstruction: "You are an expert engineering assistant. Provide detailed, accurate, and helpful information on all engineering subjects. Use standard LaTeX for formulas. You have access to Google Search for real-time information.",
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      // Maintain history for the chat
      const history = chatMessages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      const response = await chat.sendMessage({
        message: chatInput
      });

      const modelMessage = { role: 'model' as const, text: response.text || 'No response.' };
      setChatMessages(prev => [...prev, modelMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      setError('Failed to send message.');
    } finally {
      setIsChatting(false);
    }
  };

  const generateStudioImage = async () => {
    if (!studioImagePrompt.trim()) return;

    setIsGeneratingImage(true);
    setGeneratedImageUrl(null);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: studioImagePrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: studioImageAspectRatio,
            imageSize: studioImageSize
          }
        }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setGeneratedImageUrl(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (err) {
      console.error('Image generation error:', err);
      setError('Failed to generate image.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const generateStudioVideo = async () => {
    if (!studioVideoPrompt.trim()) return;

    setIsGeneratingVideo(true);
    setGeneratedVideoUrl(null);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: studioVideoPrompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: studioVideoAspectRatio
        }
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const response = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': process.env.GEMINI_API_KEY || '',
          },
        });
        const blob = await response.blob();
        setGeneratedVideoUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      console.error('Video generation error:', err);
      setError('Failed to generate video.');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const loadAnalysis = async (item: QuizAnalysis) => {
    if (!user || !item.id) return;
    
    // If questions are already loaded, just set and view
    if (item.questions && item.questions.length > 0) {
      setAnalysis(item);
      setView('analysis');
      return;
    }

    // Fetch questions from sub-collection
    try {
      const q = query(
        collection(db, 'users', user.uid, 'analyses', item.id, 'questions'),
        orderBy('id', 'asc')
      );
      const snapshot = await getDocs(q);
      const questions = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id } as Question));
      
      setAnalysis({ ...item, questions });
      setView('analysis');
    } catch (err) {
      console.error('Failed to load questions:', err);
      setError('Failed to load analysis details.');
    }
  };

  const handleDeleteAnalysis = async (analysisId: string) => {
    if (!user) return;
    setIsDeleting(true);

    try {
      // 1. Delete all questions in the sub-collection
      const questionsRef = collection(db, 'users', user.uid, 'analyses', analysisId, 'questions');
      const questionsSnapshot = await getDocs(questionsRef);
      const deletePromises = questionsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // 2. Delete the main analysis document
      await deleteDoc(doc(db, 'users', user.uid, 'analyses', analysisId));
      
      setAnalysisToDelete(null);
      // UI will update automatically via onSnapshot listener for pastAnalyses
    } catch (err) {
      console.error('Failed to delete analysis:', err);
      setError('Failed to delete analysis. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'text/plain'];
      if (validTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Please upload a PDF, Image, or Text file.');
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'text/plain'];
      if (validTypes.includes(droppedFile.type)) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('Please upload a PDF, Image, or Text file.');
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const analyzeQuiz = async () => {
    if (!file && !manualText.trim()) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      let base64Data = '';
      let mimeType = 'text/plain';
      
      if (file) {
        base64Data = await fileToBase64(file);
        mimeType = file.type;
      } else {
        // For manual text, we can just send it as text or base64
        base64Data = btoa(unescape(encodeURIComponent(manualText)));
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const prompt = `
        CRITICAL INSTRUCTION: You are an exhaustive engineering quiz analyzer. You MUST identify and analyze EVERY SINGLE question present in the provided document/image/text. 
        Do not skip any questions, even if they are repetitive or simple. If the content has 20 questions, your response must contain exactly 20 objects in the 'questions' array.
        
        SYLLABUS ALIGNMENT (ECET):
        Categorize each question into one of the following ECET Syllabus units and assign marks as per standard weighting:
        - MATHEMATICS: Matrices, Partial Fractions, Trigonometry, Complex numbers, Analytical geometry, Differentiation and its applications, Integration and its applications, Differential equations.
        - PHYSICS: Units and Dimensions, Elements of Vectors, Kinematics, Work, Power and Energy, Acoustics, Heat, Modern Physics.
        - CHEMISTRY: Atomic Structure, Chemical Bonding, Solutions, Acids and Bases, Electrochemistry, Water Technology, Corrosion, Polymers, Fuels, Environmental Chemistry.
        - COMPUTER SCIENCE: Digital Electronics, Software Engineering, Computer Organization and Microprocessors, Data Structures through C, Computer Networks, Operating Systems, DBMS, Java Programming, Web Technologies, Bid-data & Cloud Computing, Android Programming, Internet Of Things (IoT), Python Programming.

        For EACH question, provide a "NEXT LEVEL" analysis that is short, sweet, and provides full clarity.
        
        CRITICAL: Use PLAIN ENGLISH for general explanations but use standard LaTeX for ALL mathematical formulas (e.g., $E=mc^2$).
        DO NOT use Markdown headers like # or ###. 
        Ensure technical accuracy is the TOP priority. Double-check all formulas, parameters, and analogies.
        
        For each question:
        1. Identify subject and ECET Syllabus Category.
        2. Assign marks (usually 1 per question, but follow syllabus weight if applicable).
        3. Extract question text.
        4. Correct answer.
        5. Detailed explanation using LaTeX for formulas.
        6. Visualization data: 
           - Provide "steps" or "logic" visualization data if it significantly aids understanding. 
           - If it's a programming problem, provide an array of exactly 5-8 step-by-step execution strings.
           - If it's a logic/electronics problem, provide a structured breakdown.
        7. Image Generation Prompt for infographic:
           - This prompt MUST be extremely detailed to prevent AI hallucinations.
           - Include the EXACT formulas, specific parameters (values, units), and a clear, technically sound analogy.
           - Explicitly describe the visual elements: "A diagram showing [component A] connected to [component B] with labels for [parameter X] and the formula [formula Y]".
           - Style: Professional engineering infographic, clean, high-contrast, white background, technical diagram.
        8. Video Generation Prompt for a 5-10s explanatory animation.
        9. 2-3 Extra Resources (URLs to YouTube or educational sites).
        
        Return JSON:
        {
          "totalQuestionsFound": number,
          "totalMarks": number,
          "questions": [
            {
              "id": 1,
              "subject": "Subject Name",
              "syllabusCategory": "ECET Unit Name",
              "marks": number,
              "question": "Question Text",
              "correctAnswer": "Correct Answer",
              "explanation": "Plain English explanation (No $ or #)",
              "visualizationHint": "Short visualization summary",
              "imagePrompt": "Detailed prompt for infographic generation",
              "videoPrompt": "Detailed prompt for a short explanatory video animation",
              "extraResources": ["url1", "url2"],
              "visualizationData": {
                "type": "steps" | "logic",
                "data": [ ... ]
              },
              "isCorrect": true/false/null
            }
          ],
          "overallSummary": "Summary text"
        }
      `;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType, data: base64Data } }
            ]
          }
        ],
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      const result = cleanJson(response.text || '{}');
      if (!result.questions) throw new Error('Invalid analysis format.');

      // Verify exhaustive analysis
      if (result.totalQuestionsFound && result.questions.length < result.totalQuestionsFound) {
        console.warn(`Exhaustive check: Found ${result.totalQuestionsFound} but only analyzed ${result.questions.length}.`);
      }

      const { questions, ...metadata } = result;
      
      // Calculate top subject
      const subjectCounts = questions.reduce((acc: any, q: any) => {
        const s = q.subject || 'General';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {});
      const topSubject = Object.entries(subjectCounts)
        .sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'General';

      const stats = {
        total: questions.length,
        correct: questions.filter((q: any) => q.isCorrect).length,
        wrong: questions.filter((q: any) => q.isCorrect === false).length
      };

      // Initial analysis data
      const analysisData: QuizAnalysis = {
        userId: user?.uid || 'anonymous',
        fileName: file ? file.name : (manualTitle.trim() || 'Manual Text Input'),
        timestamp: new Date().toISOString(),
        ...metadata,
        stats,
        topSubject
      };

      let analysisId = 'temp-' + Date.now();
      let questionsWithDocIds = questions.map((q: Question, idx: number) => ({
        ...q,
        docId: 'temp-q-' + idx
      }));

      // Save to Firestore only if user is logged in
      if (user) {
        try {
          const docRef = await addDoc(collection(db, 'users', user.uid, 'analyses'), analysisData);
          analysisId = docRef.id;

          const questionsPromises = questions.map((q: Question) => 
            addDoc(collection(db, 'users', user.uid, 'analyses', analysisId, 'questions'), q)
          );
          const questionDocs = await Promise.all(questionsPromises);
          
          questionsWithDocIds = questions.map((q: Question, idx: number) => ({
            ...q,
            docId: questionDocs[idx].id
          }));
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.WRITE, `users/${user.uid}/analyses`);
        }
      }

      const analysisWithId: QuizAnalysis = { 
        ...analysisData, 
        id: analysisId, 
        questions: questionsWithDocIds 
      };
      
      setAnalysis(analysisWithId);
      setView('analysis');

      // Now generate infographics for each question in the background
      generateInfographics(analysisWithId, ai);
      
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Failed to analyze the quiz. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateSingleInfographic = async (q: Question, analysisId: string, customPrompt?: string, customImage?: File) => {
    if (!q.docId || generatingInfographics[q.docId]) return;
    
    setGeneratingInfographics(prev => ({ ...prev, [q.docId!]: true }));
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = customPrompt || q.imagePrompt || `Professional engineering diagram for: ${q.question}. Subject: ${q.subject}. Technical style, white background, high contrast.`;
      
      const parts: any[] = [{ text: prompt }];
      
      if (customImage) {
        const base64 = await fileToBase64(customImage);
        parts.push({
          inlineData: {
            data: base64,
            mimeType: customImage.type
          }
        });
      }

      const imageResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: parts,
        },
      });

      for (const part of imageResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          const infographicUrl = `data:image/png;base64,${base64EncodeString}`;
          const isTooLarge = infographicUrl.length > 900000;

          setAnalysis(prev => {
            if (!prev || !prev.questions) return prev;
            const newQuestions = prev.questions.map(item => 
              item.docId === q.docId ? { ...item, infographicUrl } : item
            );
            return { ...prev, questions: newQuestions };
          });

          if (user && analysisId && q.docId && !isTooLarge) {
            await updateDoc(doc(db, 'users', user.uid, 'analyses', analysisId, 'questions', q.docId), {
              infographicUrl: infographicUrl
            });
          }
          break;
        }
      }
    } catch (err) {
      console.error(`Failed to generate infographic for question ${q.id}:`, err);
    } finally {
      setGeneratingInfographics(prev => ({ ...prev, [q.docId!]: false }));
    }
  };

  const generateSingleVideo = async (q: Question, analysisId: string) => {
    if (!q.docId || generatingVideos[q.docId]) return;
    
    // Check for API key selection for Veo
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey?.();
    if (!hasKey) {
      await (window as any).aistudio?.openSelectKey?.();
    }

    setGeneratingVideos(prev => ({ ...prev, [q.docId!]: true }));
    try {
      const ai = new GoogleGenAI({ apiKey: (process.env as any).API_KEY || process.env.GEMINI_API_KEY || '' });
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: q.videoPrompt || `A simple 2D explanatory animation for: ${q.question}. Subject: ${q.subject}. Clear, educational, high contrast.`,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const response = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': (process.env as any).API_KEY || process.env.GEMINI_API_KEY || '',
          },
        });
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);

        setAnalysis(prev => {
          if (!prev || !prev.questions) return prev;
          const newQuestions = prev.questions.map(item => 
            item.docId === q.docId ? { ...item, videoUrl } : item
          );
          return { ...prev, questions: newQuestions };
        });
      }
    } catch (err) {
      console.error(`Failed to generate video for question ${q.id}:`, err);
      if (err instanceof Error && err.message.includes('Requested entity was not found')) {
        await (window as any).aistudio?.openSelectKey?.();
      }
    } finally {
      setGeneratingVideos(prev => ({ ...prev, [q.docId!]: false }));
    }
  };

  const generateInfographics = async (currentAnalysis: QuizAnalysis, ai: GoogleGenAI) => {
    if (!currentAnalysis.questions) return;
    
    // Process ALL questions automatically as requested
    const questions = [...currentAnalysis.questions];
    const concurrencyLimit = 3; // Process 3 at a time for speed
    
    for (let i = 0; i < questions.length; i += concurrencyLimit) {
      const batch = questions.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(q => {
        if (q.docId) {
          return generateSingleInfographic(q, currentAnalysis.id!);
        }
        return Promise.resolve();
      }));
    }
  };

  const downloadReport = () => {
    if (!analysis) return;

    const subjectCounts = analysis.questions?.reduce((acc: any, q: any) => {
      acc[q.subject] = (acc[q.subject] || 0) + 1;
      return acc;
    }, {});

    const syllabusCounts = analysis.questions?.reduce((acc: any, q: any) => {
      const cat = q.syllabusCategory || 'General Engineering';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const totalMarksCalculated = analysis.questions?.reduce((acc: any, q: any) => acc + (q.marks || 0), 0) || 0;

    const reportHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>EngiAnalyze - Professional Engineering Report</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
          :root {
            --primary: #2563eb;
            --secondary: #4f46e5;
            --accent: #7c3aed;
            --bg: #f8fafc;
            --text: #1e293b;
            --border: #e2e8f0;
          }
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            margin: 0;
            padding: 40px 20px;
          }
          .report-container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            padding: 60px;
            border-radius: 24px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.05);
            border: 1px solid var(--border);
          }
          header {
            border-bottom: 2px solid var(--primary);
            padding-bottom: 30px;
            margin-bottom: 40px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .logo-area h1 {
            margin: 0;
            color: var(--primary);
            font-size: 32px;
            letter-spacing: -1px;
          }
          .logo-area p {
            margin: 5px 0 0;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 2px;
            font-weight: 800;
            color: #64748b;
          }
          .report-meta {
            text-align: right;
            font-size: 12px;
            color: #64748b;
          }
          .section { margin-bottom: 50px; }
          .section-title {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 2px;
            font-weight: 900;
            color: var(--primary);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .section-title::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--border);
          }
          .summary-box {
            background: #f1f5f9;
            padding: 25px;
            border-radius: 16px;
            font-size: 15px;
            border-left: 4px solid var(--primary);
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 40px;
          }
          .stat-card {
            background: white;
            padding: 20px;
            border-radius: 16px;
            border: 1px solid var(--border);
            text-align: center;
          }
          .stat-label { font-size: 10px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 5px; }
          .stat-value { font-size: 24px; font-weight: 800; color: var(--text); }
          
          .subject-distribution { margin-top: 20px; }
          .subject-row { display: flex; align-items: center; gap: 15px; margin-bottom: 12px; }
          .subject-name { width: 180px; font-size: 13px; font-weight: 600; }
          .progress-bg { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
          .progress-fill { height: 100%; background: var(--primary); border-radius: 4px; }
          .subject-val { width: 40px; text-align: right; font-size: 12px; font-weight: 700; color: #64748b; }

          .question-card {
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            page-break-inside: avoid;
          }
          .q-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .q-badge { background: var(--primary); color: white; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 800; }
          .q-subject-badge { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
          .q-text { font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #0f172a; }
          .answer-label { font-size: 10px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 8px; }
          .answer-text { background: #f0fdf4; color: #166534; padding: 12px 20px; border-radius: 12px; font-weight: 700; margin-bottom: 20px; border: 1px solid #dcfce7; }
          .explanation-area { font-size: 15px; color: #475569; margin-bottom: 25px; }
          
          .infographic-box { margin-top: 25px; border-radius: 16px; overflow: hidden; border: 1px solid var(--border); background: #f8fafc; padding: 15px; }
          .infographic-img { width: 100%; height: auto; border-radius: 12px; }
          
          .visualizer-box { margin-top: 25px; background: #1e293b; padding: 25px; border-radius: 16px; min-height: 250px; }
          .visualizer-title { color: white; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; opacity: 0.7; }
          
          .deep-dive-box { background: #faf5ff; border: 1px solid #f3e8ff; padding: 25px; border-radius: 16px; margin-top: 25px; }
          .deep-dive-title { color: #7c3aed; font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 15px; }

          footer { margin-top: 60px; padding-top: 30px; border-top: 1px solid var(--border); text-align: center; font-size: 11px; color: #94a3b8; }
          
          @media print {
            body { padding: 0; background: white; }
            .report-container { box-shadow: none; border: none; max-width: 100%; padding: 0; }
            .question-card { border: 1px solid #eee; }
          }
        </style>
      </head>
      <body>
        <div class="report-container">
          <header>
            <div class="logo-area">
              <h1>EngiAnalyze</h1>
              <p>Engineering Quiz Intelligence System</p>
            </div>
            <div class="report-meta">
              <div>Report ID: ${analysis.id?.slice(-8).toUpperCase() || 'N/A'}</div>
              <div>Date: ${new Date(analysis.timestamp).toLocaleDateString()}</div>
              <div>File: ${analysis.fileName}</div>
            </div>
          </header>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Total Questions</div>
              <div class="stat-value">${analysis.questions?.length || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Marks</div>
              <div class="stat-value">${totalMarksCalculated}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Top Domain</div>
              <div class="stat-value" style="font-size: 14px">${analysis.topSubject || 'N/A'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Analysis Status</div>
              <div class="stat-value" style="font-size: 14px; color: #166534">Verified</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Executive Summary</div>
            <div class="summary-box">
              ${analysis.overallSummary}
            </div>
          </div>

          <div class="section">
            <div class="section-title">ECET Syllabus Domain Breakdown</div>
            <div class="subject-distribution">
              ${Object.entries(syllabusCounts).map(([cat, count]: [string, any]) => `
                <div class="subject-row">
                  <div class="subject-name">${cat}</div>
                  <div class="progress-bg">
                    <div class="progress-fill" style="width: ${(count / (analysis.questions?.length || 1)) * 100}%"></div>
                  </div>
                  <div class="subject-val">${count} Qs</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="section">
            <div class="section-title">Detailed Question Analysis</div>
            ${analysis.questions?.map((q, idx) => `
              <div class="question-card">
                <div class="q-meta">
                  <span class="q-badge">Q${idx + 1}</span>
                  <div style="text-align: right">
                    <div class="q-subject-badge">${q.subject}</div>
                    <div style="font-size: 10px; color: #94a3b8; font-weight: 700; margin-top: 4px;">
                      ${q.syllabusCategory} • Marks: ${q.marks || 1}
                    </div>
                  </div>
                </div>
                <div class="q-text">${q.question}</div>
                
                <div class="answer-label">Correct Answer</div>
                <div class="answer-text">${q.correctAnswer}</div>

                <div class="answer-label" style="color: var(--primary)">Explanation</div>
                <div class="explanation-area" style="white-space: pre-wrap;">
                  ${q.explanation}
                </div>

                ${q.extraResources && q.extraResources.length > 0 ? `
                  <div class="deep-dive-box" style="border-color: #22c55e33; background: #22c55e05;">
                    <div class="deep-dive-title" style="color: #22c55e">Extra Learning Resources</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">
                      ${q.extraResources.map((url, i) => `
                        <a href="${url}" target="_blank" style="color: #3b82f6; font-size: 12px; text-decoration: none; background: rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">Resource ${i + 1}</a>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}

                ${q.videoPrompt ? `
                  <div class="deep-dive-box" style="border-color: #ef444433; background: #ef444405;">
                    <div class="deep-dive-title" style="color: #ef4444">Video Generation Prompt</div>
                    <div style="font-size: 12px; color: #94a3b8; font-family: monospace; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px; margin-top: 10px;">
                      ${q.videoPrompt}
                    </div>
                  </div>
                ` : ''}

                ${q.visualizationData && q.visualizationData.type !== 'graph' ? `
                  <div class="visualizer-box">
                    <div class="visualizer-title">${q.visualizationHint || 'Interactive Visual'}</div>
                    ${q.visualizationData.type === 'steps' ? `
                      <div style="color: white; font-size: 14px; line-height: 1.8;">
                        ${q.visualizationData.data.map((step: string, i: number) => `
                          <div style="display: flex; gap: 15px; margin-bottom: 12px;">
                            <div style="width: 24px; height: 24px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #3b82f6; flex-shrink: 0;">${i + 1}</div>
                            <div>${step}</div>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                ` : ''}

                ${q.deepDive ? `
                  <div class="deep-dive-box">
                    <div class="deep-dive-title">Advanced Deep Dive Insights</div>
                    <div class="explanation-area" style="font-size: 14px">
                      ${q.deepDive.replace(/\n/g, '<br>')}
                    </div>
                  </div>
                ` : ''}

                ${q.infographicUrl ? `
                  <div class="infographic-box">
                    <img src="${q.infographicUrl}" class="infographic-img" alt="Engineering Infographic">
                    <div style="color: #64748b; font-size: 10px; margin-top: 10px; font-style: italic; font-weight: 600;">
                      Visual Concept: ${q.visualizationHint}
                    </div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>

          <footer>
            Generated by EngiAnalyze Intelligence System • Professional Engineering Report • Page 1 of 1
          </footer>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([reportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EngiAnalyze_Report_${analysis.fileName.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeepDive = async (q: any) => {
    setIsDeepDiving(q.id);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `
        CRITICAL: Provide a "Next Level" explanation for the following engineering question in PLAIN ENGLISH.
        DO NOT use LaTeX symbols like $ or $$. 
        DO NOT use Markdown headers like # or ###. 
        Keep it short, sweet, and easy to understand for everyone.
        
        Question: ${q.question}
        Correct Answer: ${q.correctAnswer}
        
        Cover:
        1. First Principles: The fundamental laws.
        2. Historical Context: Why was this developed?
        3. Advanced Nuances: Common misconceptions.
        4. Cross-Disciplinary Links: Relation to other fields.
        5. Practical Mastery: Real-world application.
      `;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      const content = response.text || 'No deep dive available.';
      setDeepDiveResult({ id: q.id, content });
      
      // Update analysis object to include deep dive for download
      if (analysis) {
        const updatedQuestions = analysis.questions.map((question: any) => 
          question.id === q.id ? { ...question, deepDive: content } : question
        );
        setAnalysis({ ...analysis, questions: updatedQuestions });
      }
    } catch (err) {
      console.error('Deep dive error:', err);
      setError('Failed to generate deep dive.');
    } finally {
      setIsDeepDiving(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-blue-100">
      <Toaster position="top-right" richColors />
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {analysisToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setAnalysisToDelete(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-4">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Analysis?</h3>
                <p className="text-gray-500 mb-6">
                  This will permanently remove this analysis and all associated data. This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    disabled={isDeleting}
                    onClick={() => setAnalysisToDelete(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isDeleting}
                    onClick={() => handleDeleteAnalysis(analysisToDelete)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 shadow-lg shadow-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Deleting...
                      </>
                    ) : (
                      'Delete'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <BrainCircuit size={24} />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">EngiAnalyze</h1>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Engineering Quiz Intelligence</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <button 
                  onClick={() => setView('dashboard')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    view === 'dashboard' ? "bg-blue-50 text-blue-600" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <LayoutDashboard size={18} /> Dashboard
                </button>
                <button 
                  onClick={() => setView('ai-studio')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    view === 'ai-studio' ? "bg-purple-50 text-purple-600" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Sparkles size={18} /> AI Studio
                </button>
                <div className="h-8 w-px bg-gray-200 mx-2" />
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-gray-900">{user.displayName}</p>
                    <p className="text-[10px] text-gray-500">{user.email}</p>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    title="Sign Out"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              </>
            ) : (
              <button 
                onClick={handleLogin}
                className="px-6 py-2 bg-gray-900 text-white rounded-xl font-semibold hover:bg-black transition-all active:scale-95 flex items-center gap-2"
              >
                Sign In with Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-700 mb-8"
            >
              <AlertCircle size={20} />
              <p className="text-sm font-medium">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <XCircle size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* View: AI Studio */}
        {view === 'ai-studio' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">AI Studio</h2>
                <p className="text-gray-500">Advanced multi-modal engineering workspace</p>
              </div>
              <div className="flex p-1 bg-gray-100 rounded-2xl">
                <button
                  onClick={() => setStudioTab('chat')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    studioTab === 'chat' ? "bg-white text-purple-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <MessageSquare size={14} /> Chat
                </button>
                <button
                  onClick={() => setStudioTab('image')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    studioTab === 'image' ? "bg-white text-purple-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <ImageIcon size={14} /> Image
                </button>
                <button
                  onClick={() => setStudioTab('video')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                    studioTab === 'video' ? "bg-white text-purple-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Film size={14} /> Video
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] border border-gray-200 shadow-xl overflow-hidden min-h-[600px] flex flex-col">
              {studioTab === 'chat' && (
                <>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[500px]">
                    {chatMessages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50 py-20">
                        <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center text-purple-600">
                          <BrainCircuit size={32} />
                        </div>
                        <div>
                          <p className="font-bold">Engineering Assistant</p>
                          <p className="text-sm">Ask me anything about structural analysis, thermodynamics, or circuit design.</p>
                        </div>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={cn(
                        "flex w-full",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}>
                        <div className={cn(
                          "max-w-[80%] p-4 rounded-2xl text-sm",
                          msg.role === 'user' 
                            ? "bg-purple-600 text-white rounded-tr-none" 
                            : "bg-gray-100 text-gray-800 rounded-tl-none"
                        )}>
                          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {msg.text}
                          </Markdown>
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="relative">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                        placeholder="Ask a complex engineering question..."
                        className="w-full bg-white border border-gray-200 rounded-2xl px-6 py-4 pr-16 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all text-sm"
                      />
                      <button
                        onClick={sendChatMessage}
                        disabled={isChatting || !chatInput.trim()}
                        className="absolute right-2 top-2 bottom-2 px-4 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all disabled:opacity-50"
                      >
                        {isChatting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase tracking-widest px-2">
                      <span className="flex items-center gap-1"><Search size={10} /> Grounding Enabled</span>
                      <span className="flex items-center gap-1"><Zap size={10} /> Thinking Mode Active</span>
                    </div>
                  </div>
                </>
              )}

              {studioTab === 'image' && (
                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-gray-900 uppercase tracking-widest">Image Style & Details</label>
                      <textarea
                        value={studioImagePrompt}
                        onChange={(e) => setStudioImagePrompt(e.target.value)}
                        placeholder="A detailed blueprint of a futuristic bridge with stress analysis annotations..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-6 h-40 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all text-sm resize-none"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <label className="text-xs font-black text-gray-900 uppercase tracking-widest">Resolution</label>
                        <div className="flex gap-2">
                          {['1K', '2K', '4K'].map((size) => (
                            <button
                              key={size}
                              onClick={() => setStudioImageSize(size as any)}
                              className={cn(
                                "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                                studioImageSize === size ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:border-purple-200"
                              )}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-xs font-black text-gray-900 uppercase tracking-widest">Aspect Ratio</label>
                        <select
                          value={studioImageAspectRatio}
                          onChange={(e) => setStudioImageAspectRatio(e.target.value as any)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold focus:outline-none"
                        >
                          {['1:1', '3:4', '4:3', '9:16', '16:9', '1:4', '1:8', '4:1', '8:1'].map(ratio => (
                            <option key={ratio} value={ratio}>{ratio}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={generateStudioImage}
                      disabled={isGeneratingImage || !studioImagePrompt.trim()}
                      className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-purple-700 shadow-xl shadow-purple-200 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {isGeneratingImage ? <Loader2 className="animate-spin" size={20} /> : <><Sparkles size={20} /> Generate Studio Image</>}
                    </button>
                  </div>

                  <div className="bg-gray-50 rounded-[2rem] border border-gray-100 flex items-center justify-center overflow-hidden min-h-[400px]">
                    {generatedImageUrl ? (
                      <img src={generatedImageUrl} className="w-full h-full object-contain" alt="Generated Engineering Visual" />
                    ) : (
                      <div className="text-center space-y-4 opacity-30">
                        <ImageIcon size={48} className="mx-auto" />
                        <p className="text-xs font-bold uppercase tracking-widest">Your visual will appear here</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {studioTab === 'video' && (
                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-gray-900 uppercase tracking-widest">Video Concept</label>
                      <textarea
                        value={studioVideoPrompt}
                        onChange={(e) => setStudioVideoPrompt(e.target.value)}
                        placeholder="A 3D fly-through of a complex engine assembly showing internal combustion..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-6 h-40 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all text-sm resize-none"
                      />
                    </div>
                    
                    <div className="space-y-4">
                      <label className="text-xs font-black text-gray-900 uppercase tracking-widest">Aspect Ratio</label>
                      <div className="flex gap-4">
                        {['16:9', '9:16'].map((ratio) => (
                          <button
                            key={ratio}
                            onClick={() => setStudioVideoAspectRatio(ratio as any)}
                            className={cn(
                              "flex-1 py-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2",
                              studioVideoAspectRatio === ratio ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:border-purple-200"
                            )}
                          >
                            {ratio === '16:9' ? <Maximize size={14} /> : <Minimize size={14} />}
                            {ratio === '16:9' ? 'Landscape' : 'Portrait'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={generateStudioVideo}
                      disabled={isGeneratingVideo || !studioVideoPrompt.trim()}
                      className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-purple-700 shadow-xl shadow-purple-200 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {isGeneratingVideo ? <Loader2 className="animate-spin" size={20} /> : <><Film size={20} /> Generate Veo Video</>}
                    </button>
                    
                    <p className="text-[10px] text-gray-400 font-medium text-center">
                      Video generation may take 1-2 minutes. Please stay on this tab.
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-[2rem] border border-gray-100 flex items-center justify-center overflow-hidden min-h-[400px]">
                    {generatedVideoUrl ? (
                      <video src={generatedVideoUrl} controls className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center space-y-4 opacity-30">
                        <Play size={48} className="mx-auto" />
                        <p className="text-xs font-bold uppercase tracking-widest">Your video will appear here</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* View: Home */}
        {view === 'home' && (
          <>
            {!isAnalyzing && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-12"
              >
                <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                  Master Your Engineering <span className="text-blue-600">Quizzes</span>
                </h2>
                <p className="text-gray-600 max-w-2xl mx-auto text-lg">
                  Upload your quiz PDF and get instant deep-dive analysis, interactive visualizations, and subject-specific explanations.
                </p>
              </motion.div>
            )}

            {!isAnalyzing && (
              <div className="w-full max-w-2xl mx-auto">
                <div className="flex p-1 bg-gray-100 rounded-2xl mb-8 w-fit mx-auto">
                  <button
                    onClick={() => setInputMode('file')}
                    className={cn(
                      "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                      inputMode === 'file' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    File Upload
                  </button>
                  <button
                    onClick={() => setInputMode('text')}
                    className={cn(
                      "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                      inputMode === 'text' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Manual Text
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {inputMode === 'file' ? (
                    <motion.div
                      key="file-input"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={cn(
                        "relative border-2 border-dashed rounded-3xl p-12 transition-all duration-300",
                        dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white",
                        "flex flex-col items-center justify-center text-center shadow-sm"
                      )}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 text-blue-600">
                        <Upload size={32} />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">
                        {file ? file.name : "Drop your Quiz (PDF, Image, or Text) here"}
                      </h3>
                      <p className="text-gray-500 mb-8">
                        Supports all engineering subjects. Max file size 10MB.
                      </p>
                      
                      <div className="flex gap-4">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="px-6 py-3 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition-all active:scale-95"
                        >
                          Browse Files
                        </button>
                        {file && (
                          <button
                            onClick={analyzeQuiz}
                            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2"
                          >
                            Analyze Now <ChevronRight size={18} />
                          </button>
                        )}
                      </div>
                      
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf,image/*,text/plain" className="hidden" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="text-input"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Analysis Title (Optional)</label>
                          <input
                            type="text"
                            value={manualTitle}
                            onChange={(e) => setManualTitle(e.target.value)}
                            placeholder="e.g., Thermodynamics Quiz 1"
                            className="w-full px-4 py-3 rounded-xl border border-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quiz Content</label>
                          <textarea
                            value={manualText}
                            onChange={(e) => setManualText(e.target.value)}
                            placeholder="Paste your quiz questions, code snippets, or engineering problems here..."
                            className="w-full h-64 p-4 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all resize-none text-sm leading-relaxed"
                          />
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            {manualText.length} characters
                          </p>
                          <button
                            onClick={analyzeQuiz}
                            disabled={!manualText.trim()}
                            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Analyze Text <ChevronRight size={18} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {isAnalyzing && (
              <div className="flex flex-col items-center justify-center py-20">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="text-blue-600 mb-6"
                >
                  <Loader2 size={64} />
                </motion.div>
                <h3 className="text-2xl font-bold mb-2 tracking-tight">Exhaustive Analysis in Progress...</h3>
                <p className="text-gray-500 animate-pulse font-medium">
                  Identifying and explaining EVERY single question in your document.
                </p>
                <div className="mt-8 flex gap-2">
                  {[1, 2, 3].map(i => (
                    <motion.div
                      key={i}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                      className="w-2 h-2 rounded-full bg-blue-600"
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* View: Dashboard */}
        {view === 'dashboard' && user && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight">Your Progress</h2>
              <button 
                onClick={() => setView('home')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all"
              >
                + New Analysis
              </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 text-blue-600 mb-4">
                  <History size={20} />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Total Quizzes</span>
                </div>
                <p className="text-4xl font-bold">{pastAnalyses.length}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 text-green-600 mb-4">
                  <TrendingUp size={20} />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Avg. Score</span>
                </div>
                <p className="text-4xl font-bold">
                  {pastAnalyses.length > 0 
                    ? Math.round(pastAnalyses.reduce((acc, curr) => {
                        const total = curr.stats?.total || curr.questions?.length || 1;
                        const correct = curr.stats?.correct || curr.questions?.filter(q => q.isCorrect).length || 0;
                        return acc + (correct / total) * 100;
                      }, 0) / pastAnalyses.length)
                    : 0}%
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 text-orange-600 mb-4">
                  <Activity size={20} />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Top Subject</span>
                </div>
                <p className="text-4xl font-bold">
                  {pastAnalyses.length > 0 
                    ? (() => {
                        const counts = pastAnalyses.reduce((acc: any, curr) => {
                          const s = curr.topSubject || 'General';
                          acc[s] = (acc[s] || 0) + 1;
                          return acc;
                        }, {});
                        return Object.entries(counts).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'N/A';
                      })()
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* History List */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold">Analysis History</h3>
                <span className="text-xs text-gray-400 font-medium">Last updated: Just now</span>
              </div>
              <div className="divide-y divide-gray-50">
                {pastAnalyses.length > 0 ? (
                  pastAnalyses.map((item) => (
                    <div 
                      key={item.id} 
                      className="p-6 hover:bg-gray-50 transition-colors cursor-pointer group"
                      onClick={() => loadAnalysis(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <FileText size={24} />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900">{item.fileName}</h4>
                            <p className="text-xs text-gray-500">
                              {new Date(item.timestamp).toLocaleDateString()} • {item.stats?.total || item.questions?.length || 0} Questions
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900">
                              {item.stats?.correct || item.questions?.filter(q => q.isCorrect).length || 0}/{item.stats?.total || item.questions?.length || 0}
                            </p>
                            <p className="text-[10px] text-gray-400 uppercase font-bold">Score</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAnalysisToDelete(item.id!);
                              }}
                              className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Delete Analysis"
                            >
                              <Trash2 size={18} />
                            </button>
                            <ChevronRight className="text-gray-300 group-hover:text-blue-600 transition-colors" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center text-gray-400">
                    <p>No analyses yet. Upload your first quiz to start tracking progress!</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* View: Analysis Results */}
        {view === 'analysis' && analysis && (
          <div className="space-y-12">
            <div className="bg-white rounded-[2rem] p-8 md:p-12 border border-gray-100 shadow-sm mb-12">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-widest">Analysis Report</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
                      <History size={12} /> {new Date(analysis.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
                    {analysis.fileName}
                  </h2>
                  <p className="text-gray-500 font-medium">Comprehensive Engineering Intelligence Breakdown</p>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={downloadReport}
                    className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg shadow-gray-200 group"
                  >
                    <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
                    Download Full Report
                  </button>
                  <button
                    onClick={() => setView(user ? 'dashboard' : 'home')}
                    className="flex items-center gap-2 bg-white text-gray-600 border border-gray-200 px-6 py-3 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100/50">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white mb-4 shadow-md">
                    <FileText size={20} />
                  </div>
                  <div className="text-2xl font-black text-blue-900">{analysis.questions?.length || 0}</div>
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-1">Total Questions</div>
                </div>
                <div className="bg-orange-50/50 p-6 rounded-3xl border border-orange-100/50">
                  <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white mb-4 shadow-md">
                    <Activity size={20} />
                  </div>
                  <div className="text-2xl font-black text-orange-900">{analysis.topSubject}</div>
                  <div className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mt-1">Primary Domain</div>
                </div>
                <div className="bg-green-50/50 p-6 rounded-3xl border border-green-100/50">
                  <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center text-white mb-4 shadow-md">
                    <TrendingUp size={20} />
                  </div>
                  <div className="text-2xl font-black text-green-900">
                    {Math.round((analysis.questions?.filter(q => q.isCorrect).length || 0) / (analysis.questions?.length || 1) * 100)}%
                  </div>
                  <div className="text-[10px] font-bold text-green-600 uppercase tracking-widest mt-1">Success Rate</div>
                </div>
                <div className="bg-purple-50/50 p-6 rounded-3xl border border-purple-100/50">
                  <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white mb-4 shadow-md">
                    <BrainCircuit size={20} />
                  </div>
                  <div className="text-2xl font-black text-purple-900">
                    {analysis.questions?.filter(q => q.isCorrect).length || 0}
                  </div>
                  <div className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mt-1">Mastered Concepts</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 border-t border-gray-50 pt-12 mb-12">
                <div className="lg:col-span-2">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Executive Summary</h4>
                  </div>
                  <div className="bg-gray-50/50 p-8 rounded-[2rem] border border-gray-100 markdown-body">
                    <div className="text-gray-600 leading-relaxed text-lg italic font-medium">
                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {analysis.overallSummary}
                      </Markdown>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-6 bg-orange-500 rounded-full" />
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Domain Breakdown</h4>
                  </div>
                  <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <div className="space-y-5">
                      {Object.entries(
                        analysis.questions?.reduce((acc: any, q) => {
                          acc[q.subject] = (acc[q.subject] || 0) + 1;
                          return acc;
                        }, {}) || {}
                      ).map(([subject, count]: [string, any]) => (
                        <div key={subject} className="space-y-2">
                          <div className="flex justify-between items-end">
                            <span className="text-xs font-black text-gray-700 uppercase tracking-tighter">{subject}</span>
                            <span className="text-[10px] font-bold text-gray-400">{count} Qs</span>
                          </div>
                          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(count / (analysis.questions?.length || 1)) * 100}%` }}
                              className="h-full bg-blue-600 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Insights Section */}
              <div className="border-t border-gray-50 pt-12">
                <div className="flex items-center gap-2 mb-8">
                  <div className="w-1.5 h-6 bg-purple-600 rounded-full" />
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Performance Insights</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-3xl border border-blue-100/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                        <Zap size={16} />
                      </div>
                      <span className="text-xs font-black text-blue-900 uppercase tracking-widest">Key Strength</span>
                    </div>
                    <p className="text-sm text-blue-800 font-medium leading-relaxed">
                      You demonstrate exceptional mastery in <span className="font-black underline decoration-blue-300 underline-offset-4">{analysis.topSubject}</span>. Your conceptual understanding here is significantly above average.
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-3xl border border-purple-100/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white">
                        <Target size={16} />
                      </div>
                      <span className="text-xs font-black text-purple-900 uppercase tracking-widest">Growth Area</span>
                    </div>
                    <p className="text-sm text-purple-800 font-medium leading-relaxed">
                      Focus on refining your application of first principles. While your theoretical knowledge is strong, practical edge cases require more attention.
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-3xl border border-green-100/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white">
                        <Award size={16} />
                      </div>
                      <span className="text-xs font-black text-green-900 uppercase tracking-widest">Next Milestone</span>
                    </div>
                    <p className="text-sm text-green-800 font-medium leading-relaxed">
                      Complete 5 more deep dives to unlock the "Master Engineer" badge and gain deeper cross-disciplinary insights.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {analysis.questions?.map((q, idx) => (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="p-6 md:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
                          {idx + 1}
                        </span>
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase tracking-wider">
                          {q.subject}
                        </span>
                      </div>
                      {q.isCorrect !== undefined && q.isCorrect !== null && (
                        <div className={cn(
                          "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold",
                          q.isCorrect ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        )}>
                          {q.isCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                          {q.isCorrect ? "Correct" : "Incorrect"}
                        </div>
                      )}
                    </div>

                    <h3 className="text-xl font-bold mb-6 leading-tight">
                      {q.question}
                    </h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div>
                          <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
                            <CheckCircle2 size={14} className="text-green-500" /> Correct Answer
                          </h4>
                          <div className="p-4 bg-green-50/50 border border-green-100 rounded-2xl font-medium text-green-900">
                            {q.correctAnswer}
                          </div>
                        </div>

                        <div>
                          <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
                            <BookOpen size={14} className="text-blue-500" /> Explanation
                          </h4>
                          <div className="text-gray-600 text-sm leading-relaxed markdown-body">
                            <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {q.explanation}
                            </Markdown>
                          </div>
                          
                          <button
                            onClick={() => handleDeepDive(q)}
                            disabled={isDeepDiving === q.id}
                            className="mt-4 flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors bg-blue-50 px-3 py-2 rounded-lg group"
                          >
                            {isDeepDiving === q.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Sparkles size={14} className="group-hover:scale-110 transition-transform" />
                            )}
                            {isDeepDiving === q.id ? "Generating Deep Dive..." : "Unlock Next-Level Deep Dive"}
                          </button>
                        </div>
                      </div>

                      <div className="bg-[#151619] rounded-2xl p-6 text-white overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                          {q.visualizationData?.type === 'graph' ? <LineChartIcon size={120} /> : <Code size={120} />}
                        </div>
                        
                        <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-500 mb-4 relative z-10">
                          <BrainCircuit size={14} className="text-orange-400" /> Interactive Visual
                        </h4>
                        
                        <div className="relative z-10">
                          {q.infographicUrl ? (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="mb-6 rounded-xl overflow-hidden border border-white/10 shadow-2xl relative"
                            >
                              <img 
                                src={q.infographicUrl} 
                                alt="Engineering Infographic" 
                                className="w-full h-auto object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="p-3 bg-white/5 flex flex-col items-center gap-3 border-t border-white/10">
                                <div className="text-[10px] text-gray-400 text-center italic">
                                  Master Infographic: {q.visualizationHint}
                                </div>
                                <div className="flex gap-2 w-full">
                                  <button
                                    onClick={() => generateSingleInfographic(q, analysis.id!)}
                                    disabled={generatingInfographics[q.docId!]}
                                    className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/10"
                                  >
                                    {generatingInfographics[q.docId!] ? (
                                      <Loader2 className="animate-spin" size={14} />
                                    ) : (
                                      <Sparkles size={14} />
                                    )}
                                    Regenerate
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCustomRegenQuestion(q);
                                      setCustomRegenPrompt(q.imagePrompt || '');
                                      setCustomRegenImage(null);
                                    }}
                                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-blue-600/30"
                                  >
                                    <Plus size={14} />
                                    Custom
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          ) : (
                            <div className="mb-6 h-48 bg-white/5 rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-3 text-gray-500">
                              {generatingInfographics[q.docId!] ? (
                                <>
                                  <Loader2 className="animate-spin" size={24} />
                                  <p className="text-xs font-medium">Generating Master Infographic...</p>
                                </>
                              ) : (
                                <>
                                  <BrainCircuit size={24} className="opacity-20" />
                                  <button 
                                    onClick={() => generateSingleInfographic(q, analysis.id!)}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white transition-all"
                                  >
                                    Generate Master Infographic
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          <p className="text-gray-400 text-xs italic mb-4">
                            {q.visualizationHint}
                          </p>

                          {q.visualizationData?.type === 'steps' && q.visualizationData.data && (
                            <StepsVisualizer steps={q.visualizationData.data} />
                          )}

                          {/* Video Section */}
                          <div className="mt-8 pt-8 border-t border-white/10">
                            <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">
                              <Video size={14} className="text-red-400" /> Explanatory Video
                            </h4>
                            {q.videoUrl ? (
                              <div className="space-y-4">
                                <video 
                                  src={q.videoUrl} 
                                  controls 
                                  className="w-full rounded-xl border border-white/10 shadow-2xl"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <a 
                                    href={q.videoUrl} 
                                    download={`Explainer_Q${q.id}.mp4`}
                                    className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white transition-all"
                                  >
                                    <Download size={14} /> Download Video
                                  </a>
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(q.videoPrompt || '');
                                      toast.success('Video prompt copied to clipboard!');
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white transition-all"
                                  >
                                    <Copy size={14} /> Copy Prompt for Other AI
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="h-48 bg-white/5 rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-3 text-gray-500">
                                {generatingVideos[q.docId!] ? (
                                  <>
                                    <Loader2 className="animate-spin" size={24} />
                                    <p className="text-xs font-medium">Generating Explanatory Video...</p>
                                  </>
                                ) : (
                                  <>
                                    <Video size={24} className="opacity-20" />
                                    <button 
                                      onClick={() => generateSingleVideo(q, analysis.id!)}
                                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-400 transition-all border border-red-500/30"
                                    >
                                      Generate Explanatory Video
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Extra Resources */}
                          {q.extraResources && q.extraResources.length > 0 && (
                            <div className="mt-8 pt-8 border-t border-white/10">
                              <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">
                                <ExternalLink size={14} className="text-green-400" /> Extra Resources
                              </h4>
                              <div className="flex flex-wrap gap-3">
                                {q.extraResources.map((url, i) => (
                                  <a 
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-blue-400 border border-white/10 transition-all flex items-center gap-2"
                                  >
                                    Resource {i + 1} <ExternalLink size={12} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {!q.visualizationData && (
                            <div className="h-48 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-gray-600 text-sm">
                              No visualization data available for this question.
                            </div>
                          )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between relative z-10">
                          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Concept Visualizer v2.0</span>
                          <div className="flex gap-1">
                            {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-orange-400" />)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Deep Dive Modal */}
      <AnimatePresence>
        {deepDiveResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDeepDiveResult(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-3xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white">
                <div className="flex items-center gap-3">
                  <Sparkles size={24} />
                  <h3 className="text-xl font-bold">Next-Level Deep Dive</h3>
                </div>
                <button 
                  onClick={() => setDeepDiveResult(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-8 overflow-y-auto custom-scrollbar markdown-body">
                <div className="text-gray-700 text-sm leading-relaxed">
                  <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {deepDiveResult.content}
                  </Markdown>
                </div>
              </div>
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button 
                  onClick={() => setDeepDiveResult(null)}
                  className="px-6 py-2 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all"
                >
                  Got it, I'm a Master now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2 opacity-50">
            <BrainCircuit size={20} />
            <span className="font-bold tracking-tight">EngiAnalyze</span>
          </div>
          <p className="text-sm text-gray-500">
            © 2026 Engineering Quiz Intelligence. Built for students worldwide.
          </p>
          <div className="flex gap-6 text-sm font-medium text-gray-400">
            <span className="hover:text-gray-900 cursor-pointer">Privacy</span>
            <span className="hover:text-gray-900 cursor-pointer">Terms</span>
            <span className="hover:text-gray-900 cursor-pointer">Support</span>
          </div>
        </div>
      </footer>

      {/* Custom Regeneration Modal */}
      <AnimatePresence>
        {customRegenQuestion && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isCustomRegenerating && setCustomRegenQuestion(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Custom Regeneration</h3>
                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Question {customRegenQuestion.id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setCustomRegenQuestion(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Custom Prompt (Text Source)</label>
                  <textarea
                    value={customRegenPrompt}
                    onChange={(e) => setCustomRegenPrompt(e.target.value)}
                    placeholder="Describe exactly what you want to see in the infographic..."
                    className="w-full h-32 p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Base Image (Image Source)</label>
                  <div 
                    onClick={() => customRegenImageInputRef.current?.click()}
                    className={cn(
                      "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all",
                      customRegenImage ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-200 hover:bg-gray-50"
                    )}
                  >
                    {customRegenImage ? (
                      <div className="space-y-2">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mx-auto">
                          <ImageIcon size={24} />
                        </div>
                        <p className="text-sm font-bold text-blue-900">{customRegenImage.name}</p>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setCustomRegenImage(null);
                          }}
                          className="text-[10px] text-red-500 font-bold uppercase tracking-widest"
                        >
                          Remove Image
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload size={24} className="text-gray-300 mb-2" />
                        <p className="text-xs text-gray-500">Click to upload a base image for context</p>
                      </>
                    )}
                  </div>
                  <input 
                    type="file" 
                    ref={customRegenImageInputRef} 
                    onChange={(e) => e.target.files && setCustomRegenImage(e.target.files[0])}
                    accept="image/*"
                    className="hidden" 
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex gap-3">
                  <Info size={18} className="text-blue-600 shrink-0" />
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Providing an image source helps the AI understand the layout or style you want. The text prompt will be used to refine the technical details.
                  </p>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                <button
                  disabled={isCustomRegenerating}
                  onClick={() => setCustomRegenQuestion(null)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-white transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={isCustomRegenerating || (!customRegenPrompt.trim() && !customRegenImage)}
                  onClick={async () => {
                    setIsCustomRegenerating(true);
                    try {
                      await generateSingleInfographic(customRegenQuestion, analysis!.id!, customRegenPrompt, customRegenImage || undefined);
                      setCustomRegenQuestion(null);
                      toast.success('Visual regenerated successfully!');
                    } catch (err) {
                      toast.error('Failed to regenerate visual.');
                    } finally {
                      setIsCustomRegenerating(false);
                    }
                  }}
                  className="flex-[2] px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCustomRegenerating ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Generate Custom Visual
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
