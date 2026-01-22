
import React, { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  FileText, 
  Upload, 
  Database, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  MapPin,
  Building2,
  Euro,
  DollarSign,
  Info,
  ChevronRight,
  Code,
  Table,
  Layers,
  Search,
  CheckSquare
} from 'lucide-react';

// --- Types ---

interface Room {
  type: string;
  price: number;
}

interface Activity {
  name: string;
  price: number;
  isIncluded: boolean;
}

interface Resort {
  resortName: string;
  currency: string;
  locationType: "Component" | "Bundle";
  rooms: Room[];
  activities: Activity[];
}

interface LocationData {
  name: string;
  resorts: Resort[];
}

interface ExtractionResult {
  locations: LocationData[];
}

interface FileWithStatus {
  file: File;
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

// --- Utils ---

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

const formatCurrency = (amount: number, currency: string) => {
  try {
    const code = currency?.toUpperCase() || 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code.length === 3 ? code : 'USD',
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
};

// --- Components ---

export default function TravelDataAnalyst() {
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'json'>('preview');

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(f => ({
        file: f,
        id: Math.random().toString(36).substr(2, 9),
        status: 'pending' as const
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const processDocuments = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts = [];
      
      const systemPrompt = `You are a Senior Data Analyst. Convert the uploaded travel PDF documents into a single, structured JSON database.

EXTRACTION RULES:
1. Location: Identify the country/location for each PDF.
2. Resorts: Group all data by Resort Name.
3. The 'Finland' Rule: In Finland PDFs, room rates and activities are often bundled. Extract the bundle price as the 'price' in the rooms array. List the included activities with a price of 0 and isIncluded=true.
4. The 'Maldives' Rule: Extract the room price and separate activities (like transfers, excursions, supplements) with their individual prices. isIncluded=false unless explicitly stated as part of the room rate.
5. Currency: Identify the currency for each resort (e.g., USD, EUR, AUD).
6. Stay Logic: Ensure 'Stay' costs (rooms) are clearly identified, as these are the only items subject to discounts.
7. Output: Strict JSON format matching the schema provided.

The locationType should be "Bundle" if the Finland Rule is applied, and "Component" if the Maldives Rule is applied.`;

      parts.push({ text: systemPrompt });

      for (const f of files) {
        const base64 = await fileToBase64(f.file);
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: base64
          }
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{ parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              locations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Location Name (e.g., Maldives, Finland)" },
                    resorts: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          resortName: { type: Type.STRING },
                          currency: { type: Type.STRING, description: "3-letter ISO code or symbol" },
                          locationType: { type: Type.STRING, enum: ["Component", "Bundle"] },
                          rooms: {
                            type: Type.ARRAY,
                            items: {
                              type: Type.OBJECT,
                              properties: {
                                type: { type: Type.STRING, description: "Room/Package Name" },
                                price: { type: Type.NUMBER }
                              },
                              required: ["type", "price"]
                            }
                          },
                          activities: {
                            type: Type.ARRAY,
                            items: {
                              type: Type.OBJECT,
                              properties: {
                                name: { type: Type.STRING, description: "Activity/Service Name" },
                                price: { type: Type.NUMBER },
                                isIncluded: { type: Type.BOOLEAN }
                              },
                              required: ["name", "price", "isIncluded"]
                            }
                          }
                        },
                        required: ["resortName", "currency", "locationType", "rooms", "activities"]
                      }
                    }
                  },
                  required: ["name", "resorts"]
                }
              }
            },
            required: ["locations"]
          }
        }
      });

      const extractedData = JSON.parse(response.text || "{}") as ExtractionResult;
      setResult(extractedData);
      setFiles(prev => prev.map(f => ({ ...f, status: 'completed' })));
    } catch (err: any) {
      console.error("Extraction error:", err);
      setError(err.message || "Failed to extract data. Ensure the files are valid PDFs and your API key is correct.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `travel-database-${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-lg">
            <Layers className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Structured Travel Intel</h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">Senior Data Analyst Portal</p>
          </div>
        </div>
        
        {result && (
          <button 
            onClick={downloadJson}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md active:scale-95"
          >
            <Download className="w-4 h-4" />
            Export DB
          </button>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sidebar - Control Panel */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Source Ingestion
            </h2>
            
            <div 
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center gap-4 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group mb-6"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Drop Travel Briefs</p>
                <p className="text-[10px] text-slate-400 font-medium">Batch PDF processing enabled</p>
              </div>
              <input 
                id="file-upload" 
                type="file" 
                multiple 
                accept=".pdf" 
                className="hidden" 
                onChange={onFileChange} 
              />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {files.length === 0 ? (
                <div className="text-center py-10 border border-slate-100 rounded-xl bg-slate-50/50">
                  <p className="text-xs text-slate-400 italic">Queue is empty</p>
                </div>
              ) : (
                files.map((f) => (
                  <div key={f.id} className="group bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between hover:border-blue-200 hover:shadow-sm transition-all">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="bg-slate-100 p-2 rounded-lg group-hover:bg-blue-50 transition-colors">
                        <FileText className="w-4 h-4 text-slate-500 group-hover:text-blue-600" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-700 truncate">{f.file.name}</p>
                        <p className="text-[10px] text-slate-400">{(f.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(f.id)}
                      className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={processDocuments}
              disabled={files.length === 0 || isProcessing}
              className="w-full mt-8 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Run Extraction
                </>
              )}
            </button>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <Database className="w-24 h-24" />
            </div>
            <h3 className="text-blue-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mb-4">
              <CheckSquare className="w-3 h-3" />
              Normalization Rules
            </h3>
            <div className="space-y-4">
              <div className="group">
                <p className="text-xs font-bold text-slate-100 group-hover:text-blue-400 transition-colors">Finland Bundling</p>
                <p className="text-[10px] text-slate-400 leading-relaxed mt-1">Rates identified as bundles. Activities auto-included at $0 base.</p>
              </div>
              <div className="group">
                <p className="text-xs font-bold text-slate-100 group-hover:text-blue-400 transition-colors">Maldives Component</p>
                <p className="text-[10px] text-slate-400 leading-relaxed mt-1">Granular extraction of discrete services and room inventory.</p>
              </div>
              <div className="group">
                <p className="text-xs font-bold text-slate-100 group-hover:text-blue-400 transition-colors">Currency Isolation</p>
                <p className="text-[10px] text-slate-400 leading-relaxed mt-1">Resort-level currency detection for financial normalization.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Main Workspace */}
        <section className="lg:col-span-8">
          {!result && !isProcessing && !error && (
            <div className="h-full bg-white rounded-3xl border border-slate-200 border-dashed flex flex-col items-center justify-center p-16 text-slate-400 min-h-[500px]">
              <div className="bg-slate-50 p-8 rounded-full mb-6">
                <Table className="w-10 h-10 text-slate-200" />
              </div>
              <div className="text-center max-w-sm">
                <h3 className="text-slate-600 font-bold text-xl">System Standby</h3>
                <p className="text-sm mt-2 leading-relaxed">Please provide PDF sources to initialize the extraction engine. The Senior Analyst will process all rules automatically.</p>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="h-full bg-white rounded-3xl border border-slate-200 p-16 flex flex-col items-center justify-center gap-8 min-h-[500px]">
              <div className="relative">
                <div className="w-20 h-20 border-[6px] border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Database className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-slate-800 font-bold text-2xl tracking-tight">Processing Intelligence</h3>
                <p className="text-slate-500 text-sm mt-3 animate-pulse">Contextualizing pricing tiers and bundling logic...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-3xl p-12 flex flex-col items-center gap-6 text-center min-h-[500px] justify-center">
              <div className="bg-red-100 p-4 rounded-full text-red-600">
                <AlertCircle className="w-12 h-12" />
              </div>
              <div>
                <h3 className="text-red-900 font-bold text-xl">Intelligence Error</h3>
                <p className="text-red-700 text-sm max-w-md mt-2">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="bg-white border border-red-200 px-6 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-100 transition-colors"
              >
                Reset Module
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              {/* Tab Navigation */}
              <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex gap-2">
                  <button 
                    onClick={() => setActiveTab('preview')}
                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'preview' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    Data View
                  </button>
                  <button 
                    onClick={() => setActiveTab('json')}
                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'json' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    Database Schema
                  </button>
                </div>
                <div className="flex items-center gap-3 pr-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Extraction Health</span>
                    <span className="text-[11px] font-black text-emerald-600 uppercase">Validated</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                </div>
              </div>

              {activeTab === 'preview' ? (
                <div className="space-y-10">
                  {result.locations.map((loc, lIdx) => (
                    <div key={lIdx} className="space-y-6">
                      <div className="flex items-center gap-4 group">
                        <div className="bg-blue-600 w-1.5 h-8 rounded-full"></div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                          {loc.name}
                          <span className="text-xs font-bold text-slate-300 group-hover:text-slate-400 transition-colors uppercase tracking-[0.2em] pt-1">Location</span>
                        </h2>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {loc.resorts.map((resort, rIdx) => (
                          <div key={rIdx} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all group overflow-hidden relative">
                            <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-5 transition-transform group-hover:scale-110 ${resort.locationType === 'Bundle' ? 'bg-indigo-600' : 'bg-emerald-600'}`}></div>
                            
                            <div className="flex justify-between items-start mb-6 relative z-10">
                              <div className="space-y-2">
                                <h3 className="text-xl font-black text-slate-900 leading-none">{resort.resortName}</h3>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${resort.locationType === 'Bundle' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {resort.locationType} Rule
                                  </span>
                                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-slate-50 text-slate-400">
                                    {resort.currency}
                                  </span>
                                </div>
                              </div>
                              <div className="bg-slate-50 p-2 rounded-xl">
                                <Building2 className="w-5 h-5 text-slate-400" />
                              </div>
                            </div>

                            <div className="space-y-8 relative z-10">
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Inventory & Stay Rates</p>
                                  <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                                </div>
                                <div className="space-y-2">
                                  {resort.rooms.map((room, rmIdx) => (
                                    <div key={rmIdx} className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100 group/item hover:bg-white hover:shadow-sm transition-all">
                                      <span className="text-xs font-bold text-slate-700 group-hover/item:text-slate-900 transition-colors">{room.type}</span>
                                      <span className="text-sm font-black text-slate-900">{formatCurrency(room.price, resort.currency)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ancillary Services</p>
                                  <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                                </div>
                                <div className="space-y-1">
                                  {resort.activities.map((act, aIdx) => (
                                    <div key={aIdx} className="flex justify-between items-center px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-1.5 h-1.5 rounded-full ${act.isIncluded ? 'bg-blue-400' : 'bg-slate-200'}`}></div>
                                        <span className="text-xs font-medium text-slate-600">{act.name}</span>
                                        {act.isIncluded && (
                                          <span className="text-[8px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md uppercase tracking-tighter">Included</span>
                                        )}
                                      </div>
                                      <span className={`text-[11px] font-black ${act.price === 0 ? 'text-slate-300' : 'text-slate-700'}`}>
                                        {act.price === 0 ? '—' : formatCurrency(act.price, resort.currency)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-900 rounded-3xl p-8 overflow-hidden shadow-2xl relative group">
                   <div className="absolute top-6 right-6 flex items-center gap-2">
                     <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                     <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                     <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                   </div>
                   <div className="absolute top-6 left-8">
                     <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">Normalized_Database_Output.json</span>
                   </div>
                   <pre className="text-blue-400/90 font-mono text-xs overflow-auto max-h-[700px] custom-scrollbar selection:bg-blue-500/30 pt-10">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Global CSS */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-in {
          animation: fade-in-up 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
