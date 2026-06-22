// Compare two ImageData objects — returns similarity score 0..1
export const compareImages = (img1Data: ImageData, img2Data: ImageData): number => {
  const data1 = img1Data.data;
  const data2 = img2Data.data;
  let matches = 0;
  let total = 0;

  for (let i = 0; i < data1.length; i += 4) {
    const isDark1 = data1[i] < 128;
    const isDark2 = data2[i] < 128;
    if (isDark1 || isDark2) {
      total++;
      if (isDark1 === isDark2) matches++;
    }
  }

  return total > 0 ? matches / total : 0;
};
