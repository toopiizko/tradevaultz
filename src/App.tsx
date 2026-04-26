import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import Protected from "@/components/Protected";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Trades from "./pages/Trades";
import CalendarPage from "./pages/CalendarPage";
import Calculator from "./pages/Calculator";
import Expenses from "./pages/Expenses";
import News from "./pages/News";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner theme="dark" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Protected><Index /></Protected>} />
            <Route path="/trades" element={<Protected><Trades /></Protected>} />
            <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
            <Route path="/calculator" element={<Protected><Calculator /></Protected>} />
            <Route path="/expenses" element={<Protected><Expenses /></Protected>} />
            <Route path="/news" element={<Protected><News /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
