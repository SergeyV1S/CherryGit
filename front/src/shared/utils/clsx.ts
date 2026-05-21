export const clsx = (...args: unknown[]) => {
  let tmp;
  let str = "";
  const len = args.length;

  for (let i = 0; i < len; i++) {
    if ((tmp = args[i])) {
      if (typeof tmp === "string") {
        str += (str && " ") + tmp;
      }
    }
  }
  return str;
};
