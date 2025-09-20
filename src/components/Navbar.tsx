import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

interface LeaderboardEntry {
  rank: number;
  display_name: string;
  total_score: number;
  total_time: number;
}

const Navbar = () => {
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ display_name: string } | null>(null);
  const { signOut, user } = useAuth();
  const isMobile = useIsMobile();

  useEffect(() => {
    loadLeaderboard();
    if (user) {
      loadUserProfile();
    }
  }, [user]);

  // Close mobile menu when switching to desktop
  useEffect(() => {
    if (!isMobile && isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  }, [isMobile, isMobileMenuOpen]);

  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error loading user profile:", error);
        return;
      }

      setUserProfile(data);
    } catch (error) {
      console.error("Error loading user profile:", error);
    }
  };

  const loadLeaderboard = async (retryCount = 0) => {
    try {
      setIsLeaderboardLoading(true);
      setLeaderboardError(null);
      
      // Use pagination to limit the number of records retrieved in a single query
      // Start with a reasonable page size
      const PAGE_SIZE = 100;
      let page = 0;
      let hasMoreData = true;
      let allAnswers: any[] = [];
      
      // Fetch data in batches until all data is retrieved
      while (hasMoreData) {
        try {
          const { data, error } = await supabase
            .from("user_answers")
            .select(`
              user_id,
              is_correct,
              time_taken_seconds,
              question_id,
              profiles!inner(display_name)
            `)
            .eq("is_correct", true)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          if (error) throw error;
          
          if (data && data.length > 0) {
            allAnswers = [...allAnswers, ...data];
            page++;
            
            // If we got fewer results than the page size, we've reached the end
            if (data.length < PAGE_SIZE) {
              hasMoreData = false;
            }
          } else {
            hasMoreData = false;
          }
        } catch (innerError) {
          console.error("Error fetching batch of leaderboard data:", innerError);
          
          // If we encounter an error in a batch, try to proceed with what we have
          hasMoreData = false;
        }
      }

      // Calculate leaderboard scores
      const userScores: Record<string, { name: string; correct: number; totalTime: number; questionIds: Set<string> }> = {};
      
      allAnswers.forEach((answer: any) => {
        const userId = answer.user_id;
        if (!userScores[userId]) {
          userScores[userId] = {
            name: answer.profiles.display_name || "Anonymous",
            correct: 0,
            totalTime: 0,
            questionIds: new Set()
          };
        }
        
        // Only count each question once per user (in case of duplicate answers)
        if (!userScores[userId].questionIds.has(answer.question_id)) {
          userScores[userId].questionIds.add(answer.question_id);
          userScores[userId].correct += 1;
          userScores[userId].totalTime += answer.time_taken_seconds;
        }
      });

      const leaderboardData = Object.entries(userScores)
        .map(([_, userData]) => ({
          display_name: userData.name,
          total_score: (userData.correct / 5) * 100, // 5 total questions
          total_time: userData.totalTime
        }))
        .sort((a, b) => {
          if (b.total_score !== a.total_score) return b.total_score - a.total_score;
          return a.total_time - b.total_time;
        })
        .slice(0, 10)
        .map((entry, index) => ({
          rank: index + 1,
          ...entry
        }));

      setLeaderboard(leaderboardData);
    } catch (error: any) {
      console.error("Error loading leaderboard:", error);
      setLeaderboardError(error?.message || "Failed to load leaderboard data");
      
      // Retry up to 3 times with exponential backoff if there's a connection issue
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`Retrying leaderboard load in ${delay}ms (attempt ${retryCount + 1}/3)`);
        setTimeout(() => loadLeaderboard(retryCount + 1), delay);
      }
    } finally {
      // Only set loading to false if this is the original request or the last retry
      if (retryCount === 3) {
        setIsLeaderboardLoading(false);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <nav className="border-b terminal-border bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <h1 className="text-xl sm:text-2xl font-bold text-primary font-display morse-glow">
              MORSE CODE
            </h1>
            <span className="text-primary font-mono text-sm sm:text-base">... --- ...</span>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {user && (
              <span className="text-primary font-mono text-sm">
                Welcome, {userProfile?.display_name || user.email}
              </span>
            )}
            
            <Button
              onClick={() => setIsLeaderboardOpen(!isLeaderboardOpen)}
              variant="outline"
              className="terminal-border font-mono"
            >
              <ChevronDown className={`mr-2 h-4 w-4 transition-transform ${isLeaderboardOpen ? 'rotate-180' : ''}`} />
              LEADERBOARD
            </Button>

            {user && (
              <Button
                onClick={handleSignOut}
                variant="outline"
                size="sm"
                className="terminal-border font-mono"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              variant="outline"
              size="sm"
              className="terminal-border"
            >
              {isMobileMenuOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t terminal-border">
            <div className="flex flex-col space-y-3">
              {user && (
                <div className="text-primary font-mono text-sm px-2">
                  Welcome, {userProfile?.display_name || user.email}
                </div>
              )}
              
              <Button
                onClick={() => {
                  setIsLeaderboardOpen(!isLeaderboardOpen);
                  setIsMobileMenuOpen(false);
                }}
                variant="outline"
                className="terminal-border font-mono w-full justify-start"
              >
                <ChevronDown className={`mr-2 h-4 w-4 transition-transform ${isLeaderboardOpen ? 'rotate-180' : ''}`} />
                LEADERBOARD
              </Button>

              {user && (
                <Button
                  onClick={() => {
                    handleSignOut();
                    setIsMobileMenuOpen(false);
                  }}
                  variant="outline"
                  className="terminal-border font-mono w-full justify-start"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  SIGN OUT
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Leaderboard */}
      {isLeaderboardOpen && (
        <div className="border-t terminal-border">
          <div className="container mx-auto px-4 py-4">
            <Card className="terminal-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-primary font-display text-lg sm:text-xl">
                  Top 10 Participants
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    loadLeaderboard();
                  }}
                  disabled={isLeaderboardLoading}
                  className="h-8 w-8 p-0"
                >
                  <span className="sr-only">Refresh</span>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className={`${isLeaderboardLoading ? 'animate-spin' : ''}`}
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {isLeaderboardLoading ? (
                    <div className="text-center text-muted-foreground font-mono py-4 text-sm">
                      Loading leaderboard...
                    </div>
                  ) : leaderboardError ? (
                    <div className="text-center py-4">
                      <p className="text-red-400 font-mono text-sm mb-2">{leaderboardError}</p>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => loadLeaderboard()}
                        className="font-mono text-xs"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : leaderboard.length > 0 ? (
                    leaderboard.map((entry) => (
                      <div key={entry.rank} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-muted/50 rounded terminal-border space-y-1 sm:space-y-0">
                        <div className="flex items-center space-x-3">
                          <span className="text-morse-glow font-mono font-bold min-w-[30px]">
                            #{entry.rank}
                          </span>
                          <span className="font-mono text-primary text-sm sm:text-base">
                            {entry.display_name}
                          </span>
                        </div>
                        <div className="flex space-x-4 text-xs sm:text-sm font-mono">
                          <span className="text-morse-glow">
                            {Math.round(entry.total_score)}%
                          </span>
                          <span className="text-muted-foreground">
                            {entry.total_time}s
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground font-mono py-4 text-sm">
                      No participants yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;