interface RobotsRules {
  allow: string[];
  disallow: string[];
}
export function parseRobots(text: string, userAgent = '*'): RobotsRules {
  const blocks = text.split(/\r?\n/).reduce<{ active: boolean; rules: RobotsRules }>(
    (state, raw) => {
      const line = raw.replace(/#.*/, '').trim();
      const [name, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (name?.toLowerCase() === 'user-agent')
        state.active = value === '*' || value.toLowerCase() === userAgent.toLowerCase();
      if (state.active && name?.toLowerCase() === 'allow' && value) state.rules.allow.push(value);
      if (state.active && name?.toLowerCase() === 'disallow' && value)
        state.rules.disallow.push(value);
      return state;
    },
    { active: false, rules: { allow: [], disallow: [] } },
  );
  return blocks.rules;
}
export function robotsAllows(pathname: string, rules: RobotsRules) {
  const longestAllow = Math.max(
    0,
    ...rules.allow.filter((rule) => pathname.startsWith(rule)).map((rule) => rule.length),
  );
  const longestDeny = Math.max(
    0,
    ...rules.disallow.filter((rule) => pathname.startsWith(rule)).map((rule) => rule.length),
  );
  return longestAllow >= longestDeny;
}
