import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import EventListPage from "@/pages/EventListPage";
import EventDetailPage from "@/pages/EventDetailPage";
import EventCompetitionsPage from "@/pages/EventCompetitionsPage";
import EventJudgesPage from "@/pages/EventJudgesPage";
import CompetitionDetailPage from "@/pages/CompetitionDetailPage";
import CompetitorsPage from "@/pages/CompetitorsPage";
import JudgesPage from "@/pages/JudgesPage";
import PrelimPage from "@/pages/PrelimPage";
import PrelimHeatLayoutPage from "@/pages/PrelimHeatLayoutPage";
import PrelimScoringPage from "@/pages/PrelimScoringPage";
import FinalPage from "@/pages/FinalPage";
import FinalPartnershipsPage from "@/pages/FinalPartnershipsPage";
import FinalScoringPage from "@/pages/FinalScoringPage";
import CompetitionSettingsPage from "@/pages/CompetitionSettingsPage";
import EventSettingsPage from "@/pages/EventSettingsPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/events" element={<EventListPage />} />
          <Route path="/events/:eventId" element={<EventDetailPage />} />
          <Route path="/events/:eventId/competitions" element={<EventCompetitionsPage />} />
          <Route path="/events/:eventId/judges" element={<EventJudgesPage />} />
          <Route path="/events/:eventId/settings" element={<EventSettingsPage />} />
          <Route path="/competitions/:competitionId" element={<CompetitionDetailPage />} />
          <Route path="/competitions/:competitionId/competitors" element={<CompetitorsPage />} />
          <Route path="/competitions/:competitionId/judges" element={<JudgesPage />} />
          <Route path="/competitions/:competitionId/prelim" element={<PrelimPage />} />
          <Route path="/competitions/:competitionId/prelim/heat-layout" element={<PrelimHeatLayoutPage />} />
          <Route path="/competitions/:competitionId/prelim/scoring" element={<PrelimScoringPage />} />
          <Route path="/competitions/:competitionId/final" element={<FinalPage />} />
          <Route path="/competitions/:competitionId/final/partnerships" element={<FinalPartnershipsPage />} />
          <Route path="/competitions/:competitionId/final/scoring" element={<FinalScoringPage />} />
          <Route path="/competitions/:competitionId/settings" element={<CompetitionSettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
