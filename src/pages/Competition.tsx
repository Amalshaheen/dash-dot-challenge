import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";

interface Question {
  id: number;
  question_number: number;
  question_text: string;
  correct_answer: string;
}

interface UserProgress {
  currentQuestionIndex: number;
  answers: { [questionId: number]: { answer: string; isCorrect: boolean; timestamp: number } };
  completedQuestions: number[];
}

// Updated questions with morse code challenges - these will be the source of truth
const QUESTIONS: Question[] = [
  {
    id: 1,
    question_number: 1,
    question_text: "What is the morse code for 'Bitrate'?",
    correct_answer: "-... .. - .-. .- - ."
  },
  {
    id: 2,
    question_number: 2,
    question_text: "What is the morse code for 'Encryption'?",
    correct_answer: ". -. -.-. .-. -.-- .--. - .. --- -."
  },
  {
    id: 3,
    question_number: 3,
    question_text: "What is the morse code for 'Synchronous'?",
    correct_answer: "... -.-- -. -.-. .... .-. --- -. --- ..- ..."
  },
  {
    id: 4,
    question_number: 4,
    question_text: "What is the morse code for 'Redundancy'?",
    correct_answer: ".-. . -.. ..- -. -.. .- -. -.-. -.--"
  },
  {
    id: 5,
    question_number: 5,
    question_text: "What is the morse code for 'Cryptotelephony'?",
    correct_answer: "-.-. .-. -.-- .--. - --- - . .-.. . .--. .... --- -. -.--"
  }
];

const Competition = () => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [morseInput, setMorseInput] = useState("");
  const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);
  const [userProgress, setUserProgress] = useState<UserProgress>({
    currentQuestionIndex: 0,
    answers: {},
    completedQuestions: []
  });
  const [loading, setLoading] = useState(true);
  const [useLocalStorage, setUseLocalStorage] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // localStorage helper functions
  const getUserProgressKey = () => `morse_competition_progress_${user?.id || 'anonymous'}`;
  
  const saveProgressToLocalStorage = (progress: UserProgress) => {
    localStorage.setItem(getUserProgressKey(), JSON.stringify(progress));
  };

  const loadProgressFromLocalStorage = (): UserProgress => {
    const saved = localStorage.getItem(getUserProgressKey());
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved progress:", e);
      }
    }
    return {
      currentQuestionIndex: 0,
      answers: {},
      completedQuestions: []
    };
  };

  // Database helper functions
  const loadProgressFromDatabase = async (): Promise<UserProgress | null> => {
    try {
      if (!user) return null;

      // Try to get user answers from database
      const { data: userAnswers, error: answersError } = await supabase
        .from("user_answers")
        .select("question_id, user_answer, is_correct, answered_at")
        .eq("user_id", user.id);

      if (answersError) throw answersError;

      // Convert database format to our progress format
      const answers: { [questionId: number]: { answer: string; isCorrect: boolean; timestamp: number } } = {};
      const completedQuestions: number[] = [];
      let currentQuestionIndex = 0;

      if (userAnswers) {
        userAnswers.forEach(answer => {
          // Convert UUID question_id to our numeric IDs
          const question = QUESTIONS.find(q => q.id.toString() === answer.question_id);
          if (question) {
            answers[question.id] = {
              answer: answer.user_answer,
              isCorrect: answer.is_correct,
              timestamp: new Date(answer.answered_at).getTime()
            };

            if (answer.is_correct) {
              completedQuestions.push(question.id);
            }
          }
        });

        // Find the current question index - first unanswered correct question
        for (let i = 0; i < QUESTIONS.length; i++) {
          const questionAnswer = answers[QUESTIONS[i].id];
          if (!questionAnswer || !questionAnswer.isCorrect) {
            currentQuestionIndex = i;
            break;
          }
          if (i === QUESTIONS.length - 1) {
            currentQuestionIndex = QUESTIONS.length - 1; // All completed
          }
        }
      }

      return {
        currentQuestionIndex,
        answers,
        completedQuestions
      };
    } catch (error) {
      console.error("Failed to load from database:", error);
      return null;
    }
  };

  const saveAnswerToDatabase = async (questionId: number, answer: string, isCorrect: boolean, timeTaken: number) => {
    try {
      if (!user) return false;

      const { error } = await supabase
        .from("user_answers")
        .upsert({
          user_id: user.id,
          question_id: questionId.toString(), // Convert to string for UUID compatibility
          user_answer: answer,
          is_correct: isCorrect,
          time_taken_seconds: timeTaken,
          answered_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Failed to save to database:", error);
      return false;
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }
    initializeCompetition();
  }, [user, navigate]);

  const initializeCompetition = async () => {
    try {
      // First try to load from database
      const dbProgress = await loadProgressFromDatabase();
      
      if (dbProgress) {
        console.log("Loaded progress from database");
        setUserProgress(dbProgress);
        setCurrentQuestionIndex(dbProgress.currentQuestionIndex);
        setUseLocalStorage(false);
      } else {
        // Fallback to localStorage
        console.log("Falling back to localStorage");
        const localProgress = loadProgressFromLocalStorage();
        setUserProgress(localProgress);
        setCurrentQuestionIndex(localProgress.currentQuestionIndex);
        setUseLocalStorage(true);
      }
      
      setQuestionStartTime(new Date());
      setLoading(false);
    } catch (error) {
      console.error("Failed to initialize competition:", error);
      // Ultimate fallback
      setUserProgress({
        currentQuestionIndex: 0,
        answers: {},
        completedQuestions: []
      });
      setCurrentQuestionIndex(0);
      setUseLocalStorage(true);
      setQuestionStartTime(new Date());
      setLoading(false);
    }
  };

  const canAccessQuestion = (questionIndex: number): boolean => {
    // First question is always accessible
    if (questionIndex === 0) return true;
    
    // For subsequent questions, check if previous question was answered correctly
    const previousQuestionId = QUESTIONS[questionIndex - 1].id;
    const previousAnswer = userProgress.answers[previousQuestionId];
    
    return previousAnswer && previousAnswer.isCorrect;
  };

  const addDot = () => {
    setMorseInput(prev => prev + ".");
  };

  const addDash = () => {
    setMorseInput(prev => prev + "-");
  };

  const backspaceInput = () => {
    setMorseInput(prev => prev.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (!morseInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a morse code answer",
        variant: "destructive",
      });
      return;
    }

    if (!questionStartTime || !user) return;

    const currentQuestion = QUESTIONS[currentQuestionIndex];
    const endTime = new Date();
    const timeTakenSeconds = Math.floor((endTime.getTime() - questionStartTime.getTime()) / 1000);
    const isCorrect = morseInput.trim() === currentQuestion.correct_answer;

    // Try to save to database first, fallback to localStorage
    if (!useLocalStorage) {
      const dbSaved = await saveAnswerToDatabase(currentQuestion.id, morseInput.trim(), isCorrect, timeTakenSeconds);
      if (!dbSaved) {
        console.log("Database save failed, switching to localStorage");
        setUseLocalStorage(true);
      }
    }

    // Update local progress
    const newProgress: UserProgress = {
      ...userProgress,
      answers: {
        ...userProgress.answers,
        [currentQuestion.id]: {
          answer: morseInput.trim(),
          isCorrect,
          timestamp: endTime.getTime()
        }
      }
    };

    if (isCorrect) {
      newProgress.completedQuestions = [...new Set([...userProgress.completedQuestions, currentQuestion.id])];
      
      if (currentQuestionIndex < QUESTIONS.length - 1) {
        // Move to next question
        newProgress.currentQuestionIndex = currentQuestionIndex + 1;
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setMorseInput("");
        setQuestionStartTime(new Date());
        
        toast({
          title: "Correct!",
          description: `Question ${currentQuestionIndex + 1} completed. Moving to next question.`,
        });
      } else {
        // Competition finished
        toast({
          title: "Congratulations!",
          description: "You have completed all questions successfully!",
        });
        setTimeout(() => navigate("/results"), 1500);
      }
    } else {
      toast({
        title: "Incorrect Answer",
        description: "Please try again. You must answer correctly to proceed.",
        variant: "destructive",
      });
    }

    // Always save to localStorage as backup
    setUserProgress(newProgress);
    saveProgressToLocalStorage(newProgress);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <div className="text-primary font-mono">Loading competition...</div>
        </div>
      </div>
    );
  }

  // Check if current question is accessible
  if (!canAccessQuestion(currentQuestionIndex)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Card className="terminal-border max-w-md">
            <CardContent className="p-6 text-center">
              <div className="text-primary font-mono mb-4">🔒 Question Locked</div>
              <p className="text-muted-foreground">
                You must complete the previous question correctly to access this question.
              </p>
              <Button 
                onClick={() => {
                  const lastAccessibleIndex = Math.max(0, currentQuestionIndex - 1);
                  setCurrentQuestionIndex(lastAccessibleIndex);
                }}
                className="mt-4"
              >
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const currentQuestion = QUESTIONS[currentQuestionIndex];
  const progress = ((userProgress.completedQuestions.length) / QUESTIONS.length) * 100;
  const currentAnswer = userProgress.answers[currentQuestion.id];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-4 sm:py-8">
        <div className="max-w-2xl mx-auto">
          {/* Storage Status Indicator */}
          <div className="mb-4 p-2 rounded-lg bg-muted/50 text-center">
            <span className="text-xs text-muted-foreground font-mono">
              {useLocalStorage ? '📱 Local Storage Mode' : '☁️ Database Mode'} | 
              User: {user?.email?.substring(0, 20)}...
            </span>
          </div>

          {/* Progress */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 space-y-1 sm:space-y-0">
              <span className="text-primary font-mono text-sm sm:text-base">
                Question {currentQuestionIndex + 1} of {QUESTIONS.length}
              </span>
              <span className="text-muted-foreground font-mono text-sm">
                {userProgress.completedQuestions.length} completed ({Math.round(progress)}%)
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Question Status */}
          {currentAnswer && (
            <Card className={`terminal-border mb-4 ${currentAnswer.isCorrect ? 'border-green-500' : 'border-red-500'}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">
                    {currentAnswer.isCorrect ? '✓ Completed' : '✗ Incorrect - Try again'}
                  </span>
                  {currentAnswer.isCorrect && (
                    <span className="text-xs text-muted-foreground">
                      Your answer: {currentAnswer.answer}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Question Card */}
          <Card className="terminal-border mb-6 sm:mb-8">
            <CardHeader className="pb-4 sm:pb-6">
              <CardTitle className="text-primary font-display text-lg sm:text-xl">
                Question #{currentQuestion.question_number}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base sm:text-lg font-mono leading-relaxed">
                {currentQuestion.question_text}
              </p>
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  💡 Tip: Use dots (.) and dashes (-) to form morse code. 
                  Use backspace to correct mistakes.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Morse Input Section */}
          <Card className="terminal-border">
            <CardHeader className="pb-4 sm:pb-6">
              <CardTitle className="text-primary font-display text-lg sm:text-xl">
                Morse Code Input
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              {/* Display Input */}
              <div className="p-3 sm:p-4 bg-muted rounded-lg border terminal-border">
                <div className="text-center">
                  <span className="text-xs text-muted-foreground block mb-2">
                    YOUR MORSE CODE
                  </span>
                  <div className="text-2xl sm:text-3xl font-mono text-morse-glow min-h-[40px] flex items-center justify-center break-all">
                    {morseInput || "..."}
                  </div>
                </div>
              </div>

              {/* Input Buttons */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Button
                  onClick={addDot}
                  size="lg"
                  variant="outline"
                  className="h-12 sm:h-16 text-xl sm:text-2xl font-mono terminal-border hover:bg-morse-dot hover:text-background"
                >
                  •
                  <span className="ml-1 sm:ml-2 text-xs sm:text-sm">DOT</span>
                </Button>
                <Button
                  onClick={addDash}
                  size="lg"
                  variant="outline"
                  className="h-12 sm:h-16 text-xl sm:text-2xl font-mono terminal-border hover:bg-morse-dash hover:text-background"
                >
                  ─
                  <span className="ml-1 sm:ml-2 text-xs sm:text-sm">DASH</span>
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Button
                  onClick={backspaceInput}
                  variant="outline"
                  className="flex-1 font-mono text-sm sm:text-base terminal-border"
                  disabled={!morseInput}
                >
                  ⌫ BACKSPACE
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="flex-1 font-mono morse-glow text-sm sm:text-base"
                  disabled={!morseInput || (currentAnswer?.isCorrect && currentQuestionIndex === QUESTIONS.length - 1)}
                >
                  {currentAnswer?.isCorrect && currentQuestionIndex === QUESTIONS.length - 1 ? 'COMPLETED' : 'SUBMIT'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Competition;