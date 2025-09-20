
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
  id: string;
  question_number: number;
  question_text: string;
  correct_answer: string;
}


export default function Competition() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [morseInput, setMorseInput] = useState("");
  const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);
  const [userProgress, setUserProgress] = useState<{
    currentQuestionIndex: number;
    answers: { [questionId: string]: { answer: string; isCorrect: boolean; timestamp: number } };
    completedQuestions: string[];
  }>({
    currentQuestionIndex: 0,
    answers: {},
    completedQuestions: []
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch questions and user progress from Supabase
  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }
    const fetchQuestionsAndProgress = async () => {
      try {
        const { data: questionsData, error: questionsError } = await supabase
          .from("questions")
          .select("id, question_number, question_text, correct_answer")
          .order("question_number", { ascending: true });
        if (questionsError || !questionsData) throw questionsError;

        // Fetch user answers
        const { data: userAnswers, error: answersError } = await supabase
          .from("user_answers")
          .select("question_id, user_answer, is_correct, answered_at")
          .eq("user_id", user.id);
        if (answersError) throw answersError;

        // Map answers to progress
        const answers: { [questionId: string]: { answer: string; isCorrect: boolean; timestamp: number } } = {};
        const completedQuestions: string[] = [];
        let currentQuestionIndex = 0;
        if (userAnswers) {
          userAnswers.forEach(answer => {
            answers[answer.question_id] = {
              answer: answer.user_answer,
              isCorrect: answer.is_correct,
              timestamp: new Date(answer.answered_at).getTime()
            };
            if (answer.is_correct) {
              completedQuestions.push(answer.question_id);
            }
          });
          // Find the current question index - first unanswered or incorrect
          for (let i = 0; i < questionsData.length; i++) {
            const q = questionsData[i];
            const questionAnswer = answers[q.id];
            if (!questionAnswer || !questionAnswer.isCorrect) {
              currentQuestionIndex = i;
              break;
            }
            if (i === questionsData.length - 1) {
              currentQuestionIndex = questionsData.length - 1;
            }
          }
        }
        setQuestions(questionsData);
        setUserProgress({
          currentQuestionIndex,
          answers,
          completedQuestions
        });
        setCurrentQuestionIndex(currentQuestionIndex);
        setQuestionStartTime(new Date());
        setLoading(false);
      } catch (error) {
        toast({ title: "Error", description: "Failed to load questions.", variant: "destructive" });
        setLoading(false);
      }
    };
    fetchQuestionsAndProgress();
  }, [user, navigate]);

  const canAccessQuestion = (questionIndex: number): boolean => {
    if (questionIndex === 0) return true;
    if (!questions.length) return false;
    const previousQuestionId = questions[questionIndex - 1].id;
    const previousAnswer = userProgress.answers[previousQuestionId];
    return previousAnswer && previousAnswer.isCorrect;
  };

  const addDot = () => setMorseInput(prev => prev + ".");
  const addDash = () => setMorseInput(prev => prev + "-");
  const backspaceInput = () => setMorseInput(prev => prev.slice(0, -1));

  const handleSubmit = async () => {
    if (!morseInput.trim()) {
      toast({ title: "Error", description: "Please enter a morse code answer", variant: "destructive" });
      return;
    }
    if (!questionStartTime || !user || !questions.length) return;
    const currentQuestion = questions[currentQuestionIndex];
    const endTime = new Date();
    const timeTakenSeconds = Math.floor((endTime.getTime() - questionStartTime.getTime()) / 1000);

    // Fetch correct answer from Supabase (for extra safety, but already loaded)
    const isCorrect = morseInput.trim() === currentQuestion.correct_answer;

    // Save answer to Supabase
    try {
      const { error } = await supabase.from("user_answers").upsert({
        user_id: user.id,
        question_id: currentQuestion.id,
        user_answer: morseInput.trim(),
        is_correct: isCorrect,
        time_taken_seconds: timeTakenSeconds,
        answered_at: new Date().toISOString()
      });
      if (error) throw error;
    } catch (err) {
      toast({ title: "Error", description: "Failed to save answer.", variant: "destructive" });
      return;
    }

    // Update local progress state (for UI only)
    const newProgress = {
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
      if (currentQuestionIndex < questions.length - 1) {
        newProgress.currentQuestionIndex = currentQuestionIndex + 1;
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setMorseInput("");
        setQuestionStartTime(new Date());
        toast({ title: "Correct!", description: `Question ${currentQuestionIndex + 1} completed. Moving to next question.` });
      } else {
        toast({ title: "Congratulations!", description: "You have completed all questions successfully!" });
        setTimeout(() => navigate("/results"), 1500);
      }
    } else {
      toast({ title: "Incorrect Answer", description: "Please try again. You must answer correctly to proceed.", variant: "destructive" });
    }
    setUserProgress(newProgress);
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

  if (!questions.length) return null;
  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((userProgress.completedQuestions.length) / questions.length) * 100;
  const currentAnswer = userProgress.answers[currentQuestion.id];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-4 sm:py-8">
        <div className="max-w-2xl mx-auto">
          {/* Storage Status Indicator */}
          <div className="mb-4 p-2 rounded-lg bg-muted/50 text-center">
            <span className="text-xs text-muted-foreground font-mono">
              ☁️ Database Mode | 
              User: {user?.email?.substring(0, 20)}...
            </span>
          </div>

          {/* Progress */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 space-y-1 sm:space-y-0">
              <span className="text-primary font-mono text-sm sm:text-base">
                Question {currentQuestionIndex + 1} of {questions.length}
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
                  disabled={!morseInput || (currentAnswer?.isCorrect && currentQuestionIndex === questions.length - 1)}
                >
                  {currentAnswer?.isCorrect && currentQuestionIndex === questions.length - 1 ? 'COMPLETED' : 'SUBMIT'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>

  );
}
