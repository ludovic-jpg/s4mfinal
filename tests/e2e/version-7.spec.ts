/**
 * Parcours navigateur de la version 7 (23/09/2026) : réglages de l'organisme (assistant IA, e-mails), formulaires de
 * l'apprenant en page interactive publique (/formulaire/:jeton), boîte d'envoi. Base de démonstration neuve, IA factice.
 */
import { expect, test, type Page } from "@playwright/test";

const MDP = "demonstration-s4m";

async function connecter(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(MDP);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("/");
}

async function tracer(page: Page) {
  const zone = page.locator("canvas");
  await zone.evaluate((el) => el.scrollIntoView({ block: "center" })); // hors de la barre d'actions collante
  const b = (await zone.boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(b.x + 30 + i * 7, b.y + b.height / 2 + Math.sin(i / 3) * 28);
  await page.mouse.up();
}

test("admin : Organisme → Assistant IA (clé enregistrée puis effacée) et E-mails (préréglage Gmail, e-mail de test consigné)", async ({ page }) => {
  await connecter(page, "admin@demo.example");
  await page.goto("/admin/organisme");
  await expect(page.getByRole("heading", { name: "Organisme de formation" })).toBeVisible();

  // ——— Assistant IA ———
  await page.getByRole("tab", { name: "Assistant IA" }).click();
  await expect(page.getByRole("switch", { name: "Activer l'assistant IA" })).toHaveAttribute("aria-checked", "true");
  const aucuneCle = page.getByText(/^(À renseigner|Aucune)$/);
  const cleEnPlace = page.getByText(/^(En place|Définie) ✓$/);
  await expect(aucuneCle).toBeVisible();
  const enregistrer = page.getByRole("button", { name: "Enregistrer" });
  await expect(enregistrer).toBeDisabled(); // rien à enregistrer
  await page.getByLabel("Clé d'API").fill("sk-ant-test");
  await page.getByLabel("Modèle").selectOption("claude-haiku-4-5-20251001");
  await expect(enregistrer).toBeEnabled();
  await enregistrer.click();
  await expect(cleEnPlace).toBeVisible();
  await expect(page.getByLabel("Modèle")).toHaveValue("claude-haiku-4-5-20251001");
  await expect(page.getByLabel("Clé d'API")).toHaveValue(""); // jamais réaffichée
  // Rechargement : la clé reste définie (et le modèle mémorisé).
  await page.reload();
  await page.getByRole("tab", { name: "Assistant IA" }).click();
  await expect(cleEnPlace).toBeVisible();
  await expect(page.getByLabel("Modèle")).toHaveValue("claude-haiku-4-5-20251001");
  // Effacer la clé : annonce, puis effacement à l'enregistrement. L'organisme retrouve l'assistant du serveur (factice).
  await page.getByRole("button", { name: "Effacer la clé" }).click();
  await expect(page.getByText("Sera effacé à l'enregistrement")).toBeVisible();
  await enregistrer.click();
  await expect(aucuneCle).toBeVisible();
  await expect(page.getByText("Une clé du serveur sert par défaut")).toBeVisible();

  // ——— E-mails ———
  await page.getByRole("tab", { name: "E-mails" }).click();
  await expect(page.getByRole("switch", { name: "Envoyer réellement les e-mails" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Gmail / Google Workspace" }).click();
  await expect(page.getByLabel("Serveur (hôte)")).toHaveValue("smtp.gmail.com");
  await expect(page.getByLabel("Port")).toHaveValue(/^(465|587)$/);
  await expect(page.getByRole("button", { name: "Gmail / Google Workspace" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("mot de passe d'application").first()).toBeVisible(); // pas à pas Gmail
  await page.getByLabel("Identifiant (adresse e-mail)").fill("contact@exemple.fr");
  const test = page.getByRole("button", { name: "M'envoyer un e-mail de test" });
  await expect(test).toBeDisabled(); // modifications non enregistrées
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(test).toBeEnabled();
  await test.click();
  // courrier_actif = non : l'e-mail est consigné, pas expédié.
  await expect(page.getByText("E-mail consigné, mais pas expédié")).toBeVisible();
  await expect(page.getByText("L'envoi réel n'est pas activé")).toBeVisible();
  // Il apparaît dans la boîte d'envoi, journalisé, à l'adresse de l'admin.
  await page.goto("/courriers");
  const ligne = page.getByRole("listitem").filter({ hasText: "E-mail de test" }).first();
  await expect(ligne).toBeVisible();
  await expect(ligne.getByText("Journalisé")).toBeVisible();
  await expect(ligne.getByText("À : admin@demo.example")).toBeVisible();
});

test("formatrice : crée un dossier ; les formulaires partent tout seuls ; l'apprenant remplit, reprend et signe le recueil en ligne ; la pièce est validée", async ({ page, context }) => {
  await connecter(page, "formatrice@demo.example");
  await page.goto("/dossiers");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByRole("button", { name: /Luc Petit/ }).click(); // fiche avec e-mail (luc.petit@stagiaire.example)
  await page.getByRole("button", { name: /Continuer/ }).click();
  await expect(page.getByRole("button", { name: /^Menuiserie Dupont/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Continuer/ }).click();
  await page.getByRole("button", { name: /Excel — tableaux croisés/ }).click(); // formation de la semence avec ses questionnaires
  await page.getByRole("button", { name: /Continuer/ }).click();
  await page.getByRole("button", { name: /Continuer/ }).click();
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Excel — tableaux croisés");

  // Section « Formulaires de l'apprenant » : recueil et positionnement envoyés à la création, renvoi possible.
  const formulaires = page.getByRole("region", { name: "Formulaires de Luc Petit" });
  await expect(formulaires.getByText("Formulaires de l'apprenant")).toBeVisible();
  await expect(formulaires.getByText("0/5 validé(s)")).toBeVisible();
  const recueil = formulaires.getByRole("listitem").filter({ hasText: "Recueil des besoins" });
  const positionnement = formulaires.getByRole("listitem").filter({ hasText: "Test de positionnement" });
  await expect(recueil.getByText("Envoyé", { exact: true })).toBeVisible();
  await expect(positionnement.getByText("Envoyé", { exact: true })).toBeVisible();
  await expect(recueil.getByRole("button", { name: "Renvoyer" })).toBeVisible();
  await expect(recueil.getByRole("link", { name: "Invitation (PDF)" })).toBeVisible();
  await expect(formulaires.getByRole("listitem").filter({ hasText: "Évaluation des acquis" }).getByText("Non envoyé")).toBeVisible();

  // L'e-mail automatique est consigné : on y lit le lien personnel du recueil.
  const courriers = (await (await page.request.get("/api/courriers")).json()) as Array<{ type: string; destinataire: string; statut: string; corps_html: string }>;
  const courrier = courriers.find((c) => c.type === "formulaire_recueil" && c.destinataire === "luc.petit@stagiaire.example")!;
  expect(courrier.statut).toBe("journalise");
  const lien = /href="([^"]+\/formulaire\/[^"]+)"/.exec(courrier.corps_html)![1]!;

  // ——— Page publique, sans compte ———
  const apprenant = await context.browser()!.newPage();
  await apprenant.goto(lien.replace(/^https?:\/\/[^/]+/, ""));
  await expect(apprenant.getByRole("heading", { name: "Recueil des besoins", exact: true })).toBeVisible();
  await expect(apprenant.getByText("Bonjour Luc Petit,")).toBeVisible();
  await expect(apprenant.getByText("Excel — tableaux croisés dynamiques et automatisation")).toBeVisible();
  await expect(apprenant.getByText("Sophie Lambert")).toBeVisible();
  await expect(apprenant.getByText("Réponses : 0 / 6 renseignées")).toBeVisible();
  const valider = apprenant.getByRole("button", { name: "Valider et signer" });
  await expect(valider).toBeDisabled();

  const reponses: Record<string, string> = { "Quel poste occupez-vous": "Chef d'atelier depuis six ans", "Quelles sont vos attentes": "Automatiser mon reporting", "De quoi pensez-vous avoir le plus besoin": "Les tableaux croisés dynamiques" };
  for (const [debut, texte] of Object.entries(reponses)) await apprenant.getByRole("textbox", { name: new RegExp(debut) }).fill(texte);
  await apprenant.getByText("Notions de base", { exact: true }).click();
  await apprenant.locator("fieldset").filter({ hasText: "situation de handicap" }).getByText("Non", { exact: true }).click();
  await apprenant.locator("fieldset").filter({ hasText: "programme de la formation" }).getByText("Oui", { exact: true }).click();
  await expect(apprenant.getByText("Tout est répondu")).toBeVisible();
  await apprenant.getByRole("button", { name: "Enregistrer et reprendre plus tard" }).click();
  await expect(apprenant.getByText(/Brouillon enregistré le/)).toBeVisible();

  // Reprise : le brouillon vit sur le serveur, la page rechargée le retrouve.
  await apprenant.reload();
  await expect(apprenant.getByRole("textbox", { name: /Quel poste occupez-vous/ })).toHaveValue("Chef d'atelier depuis six ans");
  await expect(apprenant.getByRole("radio", { name: "Notions de base" })).toBeChecked();
  await expect(apprenant.getByText("Tout est répondu")).toBeVisible();
  await expect(apprenant.getByText(/il manque : la date, le lieu|il manque : le lieu/)).toBeVisible();

  await apprenant.getByLabel("Fait à").fill("Mulhouse");
  await tracer(apprenant);
  await apprenant.getByRole("checkbox").check();
  await expect(valider).toBeEnabled();
  await valider.click();
  await expect(apprenant.getByRole("heading", { name: "Merci, Luc !" })).toBeVisible();
  await expect(apprenant.getByText(/Votre formulaire « Recueil des besoins » est signé le|Votre recueil des besoins est signé le/)).toBeVisible();
  await expect(apprenant.getByRole("link", { name: /Télécharger mon document signé/ })).toBeVisible();
  // Le lien reste valable pour retrouver le document, mais on ne peut plus répondre.
  await apprenant.reload();
  await expect(apprenant.getByRole("heading", { name: "Merci, Luc !" })).toBeVisible();
  await apprenant.close();

  // ——— Retour formateur : la pièce est validée, sans rien avoir saisi ———
  await page.reload();
  await expect(recueil.getByText("Validé", { exact: true })).toBeVisible();
  await expect(recueil.getByText(/Signé le/)).toBeVisible();
  await expect(recueil.getByRole("button", { name: "Renvoyer" })).toHaveCount(0);
  await expect(formulaires.getByText("1/5 validé(s)")).toBeVisible();
  await recueil.getByRole("button", { name: "Voir la pièce" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expect(page.locator("dialog[open]")).toContainText("Recueil des besoins — Luc Petit");
  await page.keyboard.press("Escape");
  await expect(positionnement.getByText("Envoyé", { exact: true })).toBeVisible(); // le test, lui, attend toujours

  // Boîte d'envoi : l'envoi du formulaire et la confirmation à l'apprenant, journalisés (envoi réel non activé).
  await page.goto("/courriers");
  await expect(page.getByText("Mode « boîte locale »")).toBeVisible();
  const envoi = page.getByRole("listitem").filter({ hasText: "Formulaire : Recueil des besoins" }).filter({ hasText: "luc.petit@stagiaire.example" }).first();
  await expect(envoi).toBeVisible();
  await expect(envoi.getByText("Journalisé")).toBeVisible();
  const confirmation = page.getByRole("listitem").filter({ hasText: "Confirmation formulaire" }).filter({ hasText: "luc.petit@stagiaire.example" }).first();
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText("Journalisé")).toBeVisible();
  await expect(confirmation.getByText(/Votre formulaire « Recueil des besoins » est signé/)).toBeVisible();
  // Le formateur est prévenu lui aussi, avec le PDF signé en pièce jointe.
  await expect(page.getByRole("listitem").filter({ hasText: "Formulaire signé reçu" }).filter({ hasText: "Luc Petit" }).first()).toBeVisible();
});

test("page publique : un jeton inconnu explique que le lien a expiré ou n'est pas valide", async ({ page }) => {
  await page.goto("/formulaire/jeton-inconnu-0123456789");
  await expect(page.getByRole("heading", { name: "Ce lien a expiré ou n'est pas valide" })).toBeVisible();
  await expect(page.getByText(/demandez à votre formateur de vous (le )?renvoyer/i)).toBeVisible();
});
