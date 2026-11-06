CREATE TABLE public.visits (
  id bigint generated always as identity primary key,
  device_hash text not null,
  ip_hash text not null,
  network_hash text not null,
  kind text not null default 'main',
  created_at timestamptz not null default now()
);
GRANT ALL ON public.visits TO service_role;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
CREATE INDEX visits_created_idx ON public.visits(created_at);

CREATE OR REPLACE FUNCTION public.visit_stats(p_device text, p_ip text, p_net text)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'total', count(*),
    'main', count(*) FILTER (WHERE kind = 'main'),
    'shared', count(*) FILTER (WHERE kind = 'shared'),
    'today', count(*) FILTER (WHERE created_at > now() - interval '24 hours'),
    'devices', count(DISTINCT device_hash),
    'ips', count(DISTINCT ip_hash),
    'networks', count(DISTINCT network_hash),
    'thisDevice', count(*) FILTER (WHERE device_hash = p_device),
    'thisIp', count(*) FILTER (WHERE ip_hash = p_ip),
    'thisNetwork', count(*) FILTER (WHERE network_hash = p_net)
  ) FROM public.visits;
$$;
REVOKE ALL ON FUNCTION public.visit_stats(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visit_stats(text,text,text) TO service_role;