const DefaultReturnPath = "/workflows";

export const sanitizeIdeAuthReturnUrl = (
  candidate: string,
  origin: string,
): string => {
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return DefaultReturnPath;
  }

  try {
    const target = new URL(candidate, origin);
    if (target.origin !== origin) {
      return DefaultReturnPath;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DefaultReturnPath;
  }
};
