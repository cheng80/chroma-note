-- Source: Ottosson's 2021-01-25 linear-sRGB matrices and W3C deltaEOK.
-- https://bottosson.github.io/posts/oklab/
-- https://www.w3.org/TR/css-color-4/#color-difference-OK
-- Contract mirrors src/domain/color-search.ts. No table rewrite or derived data.
create function app_private.rgb_to_oklab_v1(rgb double precision[])
returns double precision[] language plpgsql immutable security invoker set search_path = ''
as $$
declare
  linear double precision[] := '{}';
  channel double precision;
  l double precision;
  m double precision;
  s double precision;
begin
  if rgb is null or cardinality(rgb) <> 3 or array_lower(rgb, 1) <> 1 then
    raise exception 'Invalid RGB color.' using errcode = '22023';
  end if;
  foreach channel in array rgb loop
    if channel is null or not (channel between 0 and 255) then
      raise exception 'Invalid RGB color.' using errcode = '22023';
    end if;
    channel := channel / 255;
    linear := array_append(linear, case when channel <= 0.04045 then channel / 12.92
      else power((channel + 0.055) / 1.055, 2.4::double precision) end);
  end loop;
  l := cbrt(0.4122214708 * linear[1] + 0.5363325363 * linear[2] + 0.0514459929 * linear[3]);
  m := cbrt(0.2119034982 * linear[1] + 0.6806995451 * linear[2] + 0.1073969566 * linear[3]);
  s := cbrt(0.0883024619 * linear[1] + 0.2817188376 * linear[2] + 0.6299787005 * linear[3]);
  return array[
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
end;
$$;

create function app_private.color_match_weight_v1(tags jsonb, target_lab double precision[], radius double precision)
returns double precision language plpgsql immutable security invoker set search_path = ''
as $$
declare
  item jsonb;
  weight double precision;
  total double precision := 0;
  lab double precision[];
  distance double precision;
begin
  -- Source tags are protected by stamp_records' existing valid_record_colors CHECK.
  if tags is null or jsonb_typeof(tags) <> 'array' then return 0; end if;
  for item in select value from jsonb_array_elements(tags) loop
    weight := (item->>'weight')::double precision;
    if weight is null or not (weight > 0 and weight <= 1) then continue; end if;
    lab := app_private.rgb_to_oklab_v1(array[
      (item->'rgb'->>0)::double precision,
      (item->'rgb'->>1)::double precision,
      (item->'rgb'->>2)::double precision
    ]);
    distance := sqrt((lab[1] - target_lab[1]) ^ 2 + (lab[2] - target_lab[2]) ^ 2 + (lab[3] - target_lab[3]) ^ 2);
    if distance <= radius + 1e-12::double precision then total := total + weight; end if;
  end loop;
  return total;
end;
$$;

-- A read-only set-returning RPC keeps all PostgREST date/tag/favorite/keyset
-- filters and limits available. Color is evaluated before those result pages.
create function public.search_stamp_records_by_color(p_hex text, p_radius double precision, p_min_weight double precision)
returns setof public.stamp_records language plpgsql stable security invoker set search_path = ''
as $$
declare
  bytes bytea;
  target_lab double precision[];
begin
  -- Only the product's supported settings are accepted; fail closed on bad input.
  if p_hex is null or p_hex !~ '^#[0-9A-Fa-f]{6}$'
    or p_radius is null or p_radius not in (0.06::double precision, 0.10::double precision, 0.16::double precision)
    or p_min_weight is null or p_min_weight not in (0.05::double precision, 0.10::double precision, 0.25::double precision) then
    raise exception 'Invalid color search.' using errcode = '22023';
  end if;
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  bytes := decode(substr(p_hex, 2), 'hex');
  target_lab := app_private.rgb_to_oklab_v1(array[get_byte(bytes, 0), get_byte(bytes, 1), get_byte(bytes, 2)]::double precision[]);
  return query select r.* from public.stamp_records r
    where r.user_id = (select auth.uid()) and r.status = 'ready'
      and app_private.color_match_weight_v1(r.color_tags, target_lab, p_radius) >= p_min_weight - 1e-12::double precision;
end;
$$;

revoke all on function app_private.rgb_to_oklab_v1(double precision[]),
  app_private.color_match_weight_v1(jsonb, double precision[], double precision),
  public.search_stamp_records_by_color(text, double precision, double precision) from public, anon;
grant execute on function app_private.rgb_to_oklab_v1(double precision[]),
  app_private.color_match_weight_v1(jsonb, double precision[], double precision),
  public.search_stamp_records_by_color(text, double precision, double precision) to authenticated;

comment on function public.search_stamp_records_by_color(text, double precision, double precision) is
  'OKLab proximity search over the caller''s ready records; radii and coverage are product starting values, not universal perceptual equivalence.';
