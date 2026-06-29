
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- price_alerts
CREATE TABLE public.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('crosses','crosses_up','crosses_down','gte','lte')),
  target_price NUMERIC NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','triggered')),
  repeat BOOLEAN NOT NULL DEFAULT false,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,
  last_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT ALL ON public.price_alerts TO service_role;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own price_alerts" ON public.price_alerts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX price_alerts_active_idx ON public.price_alerts(status, asset) WHERE status = 'active';
CREATE INDEX price_alerts_user_idx ON public.price_alerts(user_id);
CREATE TRIGGER price_alerts_updated BEFORE UPDATE ON public.price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- price_alert_events
CREATE TABLE public.price_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.price_alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  condition TEXT NOT NULL,
  target_price NUMERIC NOT NULL,
  triggered_price NUMERIC NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alert_events TO authenticated;
GRANT ALL ON public.price_alert_events TO service_role;
ALTER TABLE public.price_alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alert events" ON public.price_alert_events FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX price_alert_events_user_idx ON public.price_alert_events(user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.price_alert_events;
ALTER TABLE public.price_alert_events REPLICA IDENTITY FULL;

-- push_subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own push subs" ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);
