/**
 * Memformat error validasi bawaan TypeBox / Elysia menjadi pesan singkat, rapi, dan mudah dibaca
 */
export function formatValidationError(error: any): string {
  try {
    const parsed =
      typeof error.message === "string" && error.message.startsWith("{")
        ? JSON.parse(error.message)
        : null;

    if (parsed?.errors && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      const paths = parsed.errors.map((e: any) =>
        (e.path || "").replace(/^\//, "").toLowerCase()
      );

      // Jika username dan password keduanya kosong
      if (paths.includes("username") && paths.includes("password")) {
        return "Username dan password tidak boleh kosong.";
      }

      const first = parsed.errors[0];
      const rawField = first.path
        ? first.path.replace(/^\//, "")
        : parsed.property?.replace(/^\//, "") || "Data";
      const field = rawField.charAt(0).toUpperCase() + rawField.slice(1);

      // Jika nilai input kosong atau whitespace
      if (
        first.value === "" ||
        first.value === undefined ||
        first.value === null ||
        (typeof first.value === "string" && first.value.trim() === "")
      ) {
        return `${field} tidak boleh kosong.`;
      }

      const rawMsg = first.message || "";
      const minMatch = rawMsg.match(/greater or equal to (\d+)/i);
      if (minMatch) {
        return `${field} minimal ${minMatch[1]} karakter.`;
      }

      const maxMatch = rawMsg.match(/less or equal to (\d+)/i);
      if (maxMatch) {
        return `${field} maksimal ${maxMatch[1]} karakter.`;
      }

      return `${field} tidak valid.`;
    }

    if (parsed?.property) {
      const rawField = parsed.property.replace(/^\//, "");
      const field = rawField.charAt(0).toUpperCase() + rawField.slice(1);
      return `${field} tidak boleh kosong atau tidak valid.`;
    }

    return "Data yang dikirimkan tidak valid.";
  } catch {
    return "Validasi gagal: format data tidak sesuai.";
  }
}

