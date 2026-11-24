import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contaJaExiste, EntradaInvalida, validarMotivo, validarNovoSuporte, validarUuid } from "./plataforma.ts";

const valido = {
  email: "  Pessoa@BrandPlay.com ",
  full_name: " Pessoa do Suporte ",
  password: "senha-temporaria",
  comment: " Atendimento ",
};

Deno.test("novo suporte normaliza e-mail, nome e motivo", () => {
  assertEquals(validarNovoSuporte(valido), {
    email: "pessoa@brandplay.com",
    nome: "Pessoa do Suporte",
    senha: "senha-temporaria",
    motivo: "Atendimento",
  });
});

Deno.test("novo suporte recusa e-mail, nome, senha e motivo inválidos", () => {
  assertThrows(() => validarNovoSuporte({ ...valido, email: "sem-arroba" }), EntradaInvalida, "E-mail");
  assertThrows(() => validarNovoSuporte({ ...valido, email: 42 }), EntradaInvalida, "E-mail");
  assertThrows(() => validarNovoSuporte({ ...valido, full_name: "a" }), EntradaInvalida, "nome");
  assertThrows(() => validarNovoSuporte({ ...valido, password: "curta" }), EntradaInvalida, "senha");
  assertThrows(() => validarNovoSuporte({ ...valido, password: "x".repeat(73) }), EntradaInvalida, "senha");
  assertThrows(() => validarNovoSuporte({ ...valido, comment: "  " }), EntradaInvalida, "motivo");
});

Deno.test("motivo tem ao menos 3 caracteres e é cortado em 500", () => {
  assertThrows(() => validarMotivo("ok"), EntradaInvalida);
  assertThrows(() => validarMotivo(undefined), EntradaInvalida);
  assertEquals(validarMotivo("x".repeat(600)).length, 500);
});

Deno.test("uuid é conferido pelo formato", () => {
  assertEquals(validarUuid("6a63584c-3d3a-4325-9ec9-0f608b744f3b", "Fatura inválida."), "6a63584c-3d3a-4325-9ec9-0f608b744f3b");
  assertThrows(() => validarUuid("1; drop", "Fatura inválida."), EntradaInvalida, "Fatura inválida.");
});

Deno.test("conta existente é reconhecida pelo código ou pela mensagem do GoTrue", () => {
  assertEquals(contaJaExiste({ code: "email_exists" }), true);
  assertEquals(contaJaExiste({ status: 422, message: "A user with this email address has already been registered" }), true);
  assertEquals(contaJaExiste({ status: 422, message: "Password should be at least 6 characters" }), false);
  assertEquals(contaJaExiste({ status: 500, message: "already" }), false);
  assertEquals(contaJaExiste(null), false);
});
