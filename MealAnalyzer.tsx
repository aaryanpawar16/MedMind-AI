import React, { useState, useRef } from 'react';
import { Camera, Upload, Eye, Trash2, Plus, RotateCcw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface FoodItem {
  name: string;
  portionSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence?: number;
}

interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const MealAnalyzer: React.FC = () => {
  const { isDark } = useTheme();
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [analyzedFoods, setAnalyzedFoods] = useState<FoodItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [manualFoodName, setManualFoodName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setUploadedImage(result);
        analyzeImageAuto(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImageAuto = async (imageData: string) => {
    if (!imageData) return;

    setIsAnalyzing(true);
    try {
      const base64Image = imageData.split(',')[1];
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `🧠 ROLE:
You are MedMind AI, a food nutrition assistant. Your job is to analyze uploaded images of meals using vision and identify food items along with estimated nutritional values.

🎯 GOAL:
The user will upload a picture of their meal. You need to:

1. Identify each visible food item in the image (e.g., rice, dal, chapati, salad, etc.).
2. Estimate the portion size: Small / Medium / Large
3. Estimate nutritional values PER ITEM:
   - Calories (kcal)
   - Protein (g)
   - Carbohydrates (g)
   - Fat (g)

📍 FORMAT (Keep responses simple and clean like this):
---
🍱 **Meal Analysis**

1. 🥘 **Food Item:** Rice  
   Portion Size: Medium  
   Estimated Nutrition: 210 kcal | 4g Protein | 45g Carbs | 1g Fat

2. 🍛 **Food Item:** Dal  
   Portion Size: Medium  
   Estimated Nutrition: 180 kcal | 10g Protein | 25g Carbs | 4g Fat

3. 🥗 **Food Item:** Cucumber Salad  
   Portion Size: Small  
   Estimated Nutrition: 40 kcal | 1g Protein | 8g Carbs | 0g Fat
---

📝 NOTES:
- If unsure about exact portion, give your best guess.
- If food items are ambiguous or unclear, say so.
- Do not guess exotic dishes. Stick to general categories like "bread", "curry", "salad", etc.
- If the image quality is too poor to analyze, politely ask for a clearer image.`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Please analyze this meal image and provide nutrition information for each food item.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const analysisText = data.choices[0]?.message?.content || '';
      
      console.log('GPT-4o Analysis:', analysisText);
      
      const parsedFoods = parseGPTAnalysis(analysisText);
      setAnalyzedFoods(parsedFoods);
      
    } catch (error) {
      console.error('Error analyzing image:', error);
      alert('Failed to analyze image. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const parseGPTAnalysis = (text: string): FoodItem[] => {
    const foods: FoodItem[] = [];
    
    // Try to parse the structured format
    const lines = text.split('\n');
    let currentFood: Partial<FoodItem> = {};
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for food item pattern
      const foodMatch = trimmedLine.match(/\*\*Food Item:\*\*\s*(.+)/i);
      if (foodMatch) {
        if (currentFood.name) {
          // Save previous food if it has required data
          if (currentFood.calories && currentFood.protein !== undefined) {
            foods.push(currentFood as FoodItem);
          }
        }
        currentFood = { name: foodMatch[1].trim() };
        continue;
      }
      
      // Look for portion size
      const portionMatch = trimmedLine.match(/Portion Size:\s*(.+)/i);
      if (portionMatch && currentFood.name) {
        currentFood.portionSize = portionMatch[1].trim();
        continue;
      }
      
      // Look for nutrition info
      const nutritionMatch = trimmedLine.match(/Estimated Nutrition:\s*(\d+)\s*kcal.*?(\d+)g\s*Protein.*?(\d+)g\s*Carbs.*?(\d+)g\s*Fat/i);
      if (nutritionMatch && currentFood.name) {
        currentFood.calories = parseInt(nutritionMatch[1]);
        currentFood.protein = parseInt(nutritionMatch[2]);
        currentFood.carbs = parseInt(nutritionMatch[3]);
        currentFood.fat = parseInt(nutritionMatch[4]);
        currentFood.confidence = 0.8; // Default confidence
        continue;
      }
    }
    
    // Don't forget the last food item
    if (currentFood.name && currentFood.calories && currentFood.protein !== undefined) {
      foods.push(currentFood as FoodItem);
    }
    
    // Fallback parsing if structured format fails
    if (foods.length === 0) {
      const fallbackFoods = parseFallbackFormat(text);
      foods.push(...fallbackFoods);
    }
    
    return foods;
  };

  const parseFallbackFormat = (text: string): FoodItem[] => {
    const foods: FoodItem[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      // Look for any line with calories and nutrition info
      const match = line.match(/(.+?):\s*(\d+)\s*kcal.*?(\d+)g.*?(\d+)g.*?(\d+)g/i);
      if (match) {
        foods.push({
          name: match[1].trim(),
          portionSize: 'Medium',
          calories: parseInt(match[2]),
          protein: parseInt(match[3]),
          carbs: parseInt(match[4]),
          fat: parseInt(match[5]),
          confidence: 0.7
        });
      }
    }
    
    return foods;
  };

  const addManualFood = async () => {
    if (!manualFoodName.trim()) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a nutrition expert. Provide estimated nutrition values for a medium portion of the given food item. Format: "Calories: X kcal, Protein: Xg, Carbs: Xg, Fat: Xg"'
            },
            {
              role: 'user',
              content: `Estimate nutrition for a medium portion of: ${manualFoodName}`
            }
          ],
          max_tokens: 100
        })
      });

      if (response.ok) {
        const data = await response.json();
        const nutritionText = data.choices[0]?.message?.content || '';
        
        const match = nutritionText.match(/Calories:\s*(\d+).*?Protein:\s*(\d+).*?Carbs:\s*(\d+).*?Fat:\s*(\d+)/i);
        if (match) {
          const newFood: FoodItem = {
            name: manualFoodName,
            portionSize: 'Medium',
            calories: parseInt(match[1]),
            protein: parseInt(match[2]),
            carbs: parseInt(match[3]),
            fat: parseInt(match[4]),
            confidence: 0.6
          };
          
          setAnalyzedFoods(prev => [...prev, newFood]);
          setManualFoodName('');
        }
      }
    } catch (error) {
      console.error('Error getting nutrition for manual food:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeFood = (index: number) => {
    setAnalyzedFoods(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setUploadedImage(null);
    setAnalyzedFoods([]);
    setManualFoodName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const reAnalyze = () => {
    if (uploadedImage) {
      analyzeImageAuto(uploadedImage);
    }
  };

  const calculateTotals = (): NutritionTotals => {
    return analyzedFoods.reduce(
      (totals, food) => ({
        calories: totals.calories + food.calories,
        protein: totals.protein + food.protein,
        carbs: totals.carbs + food.carbs,
        fat: totals.fat + food.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  };

  const totals = calculateTotals();

  return (
    <div className={`min-h-screen p-4 transition-colors duration-300 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' 
        : 'bg-gradient-to-br from-orange-50 via-white to-amber-50'
    }`}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className={`text-4xl font-bold mb-2 ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>🧠 MedMind AI</h1>
          <p className={isDark ? 'text-slate-300' : 'text-gray-600'}>Food Nutrition Assistant</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel - Image Upload */}
          <div className={`backdrop-blur-sm rounded-2xl p-6 border transition-colors duration-300 ${
            isDark 
              ? 'bg-slate-800/50 border-slate-700' 
              : 'bg-white/80 border-orange-200'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isDark ? 'bg-orange-500' : 'bg-orange-600'
              }`}>
                <Camera className="w-5 h-5 text-white" />
              </div>
              <h2 className={`text-xl font-semibold ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>Meal Image</h2>
            </div>

            {!uploadedImage ? (
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-300 ${
                isDark 
                  ? 'border-slate-600' 
                  : 'border-orange-300'
              }`}>
                <Upload className={`w-12 h-12 mx-auto mb-4 ${
                  isDark ? 'text-slate-400' : 'text-orange-400'
                }`} />
                <p className={`mb-4 ${
                  isDark ? 'text-slate-300' : 'text-gray-700'
                }`}>Upload a photo of your meal</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`text-white px-6 py-3 rounded-lg font-medium transition-colors ${
                    isDark ? 'bg-orange-500 hover:bg-orange-600' : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  Choose Image
                </button>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={uploadedImage}
                  alt="Uploaded meal"
                  className="w-full h-64 object-cover rounded-xl"
                />
                <button
                  onClick={clearAll}
                  className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                    <div className={`rounded-lg p-4 flex items-center gap-3 ${
                      isDark ? 'bg-white/90' : 'bg-gray-900/90'
                    }`}>
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
                      <span className={`font-medium ${
                        isDark ? 'text-slate-800' : 'text-white'
                      }`}>Analyzing nutrition...</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {uploadedImage && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={reAnalyze}
                  disabled={isAnalyzing}
                  className={`flex-1 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    isDark 
                      ? 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-400' 
                      : 'bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400'
                  }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Re-analyze
                </button>
              </div>
            )}

            {/* Manual Food Addition */}
            <div className={`mt-6 pt-6 border-t transition-colors duration-300 ${
              isDark ? 'border-slate-700' : 'border-orange-200'
            }`}>
              <h3 className={`text-lg font-medium mb-3 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>Add Food Manually</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualFoodName}
                  onChange={(e) => setManualFoodName(e.target.value)}
                  placeholder="Enter food name..."
                  className={`flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors duration-300 ${
                    isDark 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                      : 'bg-white border-orange-300 text-gray-900 placeholder-gray-500'
                  }`}
                  onKeyPress={(e) => e.key === 'Enter' && addManualFood()}
                />
                <button
                  onClick={addManualFood}
                  disabled={!manualFoodName.trim() || isAnalyzing}
                  className={`text-white px-4 py-2 rounded-lg transition-colors ${
                    isDark 
                      ? 'bg-green-500 hover:bg-green-600 disabled:bg-green-400' 
                      : 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel - Nutrition Analysis */}
          <div className={`backdrop-blur-sm rounded-2xl p-6 border transition-colors duration-300 ${
            isDark 
              ? 'bg-slate-800/50 border-slate-700' 
              : 'bg-white/80 border-orange-200'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isDark ? 'bg-emerald-500' : 'bg-emerald-600'
              }`}>
                <Eye className="w-5 h-5 text-white" />
              </div>
              <h2 className={`text-xl font-semibold ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>Nutrition Analysis</h2>
            </div>

            {/* Total Nutrition */}
            <div className={`rounded-xl p-4 mb-6 transition-colors duration-300 ${
              isDark ? 'bg-slate-700/50' : 'bg-orange-50/80'
            }`}>
              <h3 className={`text-lg font-medium mb-4 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>Total Nutrition</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    isDark ? 'bg-red-500' : 'bg-red-600'
                  }`}>
                    <span className="text-white font-bold">🔥</span>
                  </div>
                  <div className={`text-2xl font-bold ${
                    isDark ? 'text-white' : 'text-gray-900'
                  }`}>{totals.calories}</div>
                  <div className={`text-sm ${
                    isDark ? 'text-slate-400' : 'text-gray-600'
                  }`}>Calories</div>
                </div>
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    isDark ? 'bg-blue-500' : 'bg-blue-600'
                  }`}>
                    <span className="text-white font-bold">🍗</span>
                  </div>
                  <div className={`text-2xl font-bold ${
                    isDark ? 'text-white' : 'text-gray-900'
                  }`}>{totals.protein}g</div>
                  <div className={`text-sm ${
                    isDark ? 'text-slate-400' : 'text-gray-600'
                  }`}>Protein</div>
                </div>
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    isDark ? 'bg-orange-500' : 'bg-orange-600'
                  }`}>
                    <span className="text-white font-bold">🥔</span>
                  </div>
                  <div className={`text-2xl font-bold ${
                    isDark ? 'text-white' : 'text-gray-900'
                  }`}>{totals.carbs}g</div>
                  <div className={`text-sm ${
                    isDark ? 'text-slate-400' : 'text-gray-600'
                  }`}>Carbs</div>
                </div>
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    isDark ? 'bg-yellow-500' : 'bg-yellow-600'
                  }`}>
                    <span className="text-white font-bold">🧈</span>
                  </div>
                  <div className={`text-2xl font-bold ${
                    isDark ? 'text-white' : 'text-gray-900'
                  }`}>{totals.fat}g</div>
                  <div className={`text-sm ${
                    isDark ? 'text-slate-400' : 'text-gray-600'
                  }`}>Fat</div>
                </div>
              </div>
            </div>

            {/* Food Items Detected */}
            <div>
              <h3 className={`text-lg font-medium mb-4 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>🍛 Food Items Detected</h3>
              
              {analyzedFoods.length === 0 ? (
                <div className="text-center py-8">
                  <div className={`mb-2 ${
                    isDark ? 'text-slate-400' : 'text-gray-600'
                  }`}>No food items analyzed yet</div>
                  <div className={`text-sm ${
                    isDark ? 'text-slate-500' : 'text-gray-500'
                  }`}>Upload an image to get started</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {analyzedFoods.map((food, index) => (
                    <div key={index} className={`rounded-lg p-4 transition-colors duration-300 ${
                      isDark ? 'bg-slate-700/50' : 'bg-orange-50/80'
                    }`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className={`font-medium flex items-center gap-2 ${
                            isDark ? 'text-white' : 'text-gray-900'
                          }`}>
                            🍽️ {food.name}
                            {food.confidence && food.confidence < 0.7 && (
                              <span className={`text-xs px-2 py-1 rounded ${
                                isDark 
                                  ? 'bg-yellow-500/20 text-yellow-400' 
                                  : 'bg-yellow-200 text-yellow-800'
                              }`}>
                                Low confidence
                              </span>
                            )}
                          </h4>
                          <p className={`text-sm ${
                            isDark ? 'text-slate-400' : 'text-gray-600'
                          }`}>Portion: {food.portionSize}</p>
                        </div>
                        <button
                          onClick={() => removeFood(index)}
                          className={`p-1 transition-colors ${
                            isDark 
                              ? 'text-red-400 hover:text-red-300' 
                              : 'text-red-500 hover:text-red-700'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div className="text-center">
                          <div className={isDark ? 'text-red-400' : 'text-red-600'}>🔥 {food.calories}</div>
                          <div className={isDark ? 'text-slate-500' : 'text-gray-500'}>kcal</div>
                        </div>
                        <div className="text-center">
                          <div className={isDark ? 'text-blue-400' : 'text-blue-600'}>🍗 {food.protein}g</div>
                          <div className={isDark ? 'text-slate-500' : 'text-gray-500'}>protein</div>
                        </div>
                        <div className="text-center">
                          <div className={isDark ? 'text-orange-400' : 'text-orange-600'}>🥔 {food.carbs}g</div>
                          <div className={isDark ? 'text-slate-500' : 'text-gray-500'}>carbs</div>
                        </div>
                        <div className="text-center">
                          <div className={isDark ? 'text-yellow-400' : 'text-yellow-600'}>🧈 {food.fat}g</div>
                          <div className={isDark ? 'text-slate-500' : 'text-gray-500'}>fat</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MealAnalyzer;