/**
 * Parcours navigateur du document « Modification 1 » (23/09/2026), avec le compte pilote demandé
 * (ludoalbisser@gmail.com / 1234ludo), sur une base de démonstration neuve.
 */
import { expect, test, type Page } from "@playwright/test";

async function connecterPilote(page: Page) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill("ludoalbisser@gmail.com");
  await page.getByLabel("Mot de passe").fill("1234ludo");
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

test("compte pilote : menu à trois espaces, coffre-fort, positionnements, profil et archives", async ({ page }) => {
  await connecterPilote(page);
  const nav = page.getByRole("navigation");
  for (const lien of ["Coffre-fort pédagogique", "Positionnements", "Mon profil et candidature", "Archives et sauvegarde"]) {
    await expect(nav.getByRole("link", { name: lien })).toBeVisible();
  }
  await nav.getByRole("link", { name: "Mon profil et candidature" }).click();
  await expect(page.getByRole("heading", { name: "Mon profil" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Justificatifs/ })).toBeVisible();
});

test("compte pilote : génère un parcours en 3 modules avec seulement titre, heures, jours, tarif et nombre de modules", async ({ page }) => {
  await connecterPilote(page);
  await page.goto("/formations");
  await page.getByRole("button", { name: "Nouvelle formation" }).first().click();
  const modale = page.locator("dialog");
  await modale.getByLabel("Intitulé de la formation").fill("Améliorer ma prospection");
  await modale.getByLabel("Niveau").selectOption("Débutant");
  await modale.getByLabel("Durée (heures)").fill("14");
  await modale.getByLabel("Durée (jours)").fill("2");
  await modale.getByLabel("Nombre de modules").selectOption("3");
  await modale.getByLabel("Tarif HT par stagiaire (€)").fill("1400");
  await modale.getByRole("button", { name: "Générer le parcours" }).click();
  await expect(modale.getByText("Trame de parcours générée")).toBeVisible();
  await expect(modale.locator("details")).toHaveCount(3);
  await expect(modale.getByText("Somme des modules : 14 h")).toBeVisible();
  await modale.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Améliorer ma prospection");
  await expect(page.getByText("Parcours enregistré")).toBeVisible();

  // Même fonctionnalité pour le test de positionnement : brouillon, aménagement, enregistrement.
  await page.getByRole("button", { name: "Générer le test de positionnement" }).click();
  await page.locator("dialog").getByRole("button", { name: "Générer le brouillon" }).click();
  await expect(page.locator("dialog").getByText("Brouillon généré")).toBeVisible();
  await page.locator("dialog").getByRole("button", { name: "Enregistrer le modèle" }).click();
  await expect(page.getByText("Test de positionnement").first()).toBeVisible();
});

test("compte pilote : crée un apprenant ET son entreprise, l'invite à se positionner ; l'apprenant signe ; le PDF est disponible", async ({ page, context }) => {
  await connecterPilote(page);
  await page.goto("/repertoire");
  await page.getByRole("button", { name: "Nouvelle fiche apprenant" }).click();
  const modale = page.locator("dialog[open]");
  await modale.getByLabel(/^Prénom/).fill("Julie");
  await modale.getByLabel(/^Nom \*/).fill("Test");
  await modale.getByLabel("Adresse e-mail").fill("julie.test@apprenant.example");
  await modale.getByLabel("Entreprise de rattachement").selectOption({ label: "+ Créer une nouvelle entreprise…" });
  await modale.getByLabel(/^Raison sociale/).fill("Atelier Julie SARL");
  await modale.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Atelier Julie SARL").first()).toBeVisible();

  await page.getByRole("listitem").filter({ hasText: "Julie Test" }).getByRole("button", { name: /Positionner/ }).click();
  await page.locator("dialog[open]").getByLabel("Parcours de formation").selectOption({ label: "Améliorer ma prospection" });
  await page.locator("dialog[open]").getByRole("button", { name: "Envoyer l'invitation" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  // L'e-mail automatique est consigné : on y lit le lien personnel.
  const courriers = (await (await page.request.get("/api/courriers")).json()) as Array<{ type: string; corps_html: string }>;
  const lien = /href="([^"]+\/positionnement\/[^"]+)"/.exec(courriers.find((c) => c.type === "invitation_positionnement")!.corps_html)![1]!;

  const apprenant = await context.browser()!.newPage();
  await apprenant.goto(lien.replace(/^https?:\/\/[^/]+/, ""));
  await expect(apprenant.getByRole("heading", { name: "Mon positionnement" })).toBeVisible();
  await expect(apprenant.getByLabel("Adresse e-mail")).toHaveValue("julie.test@apprenant.example");
  const reponses: Record<string, string> = { "Quel poste occupez-vous": "Commerciale depuis 2 ans", "Quelles sont vos attentes": "Trouver des clients", "De quoi pensez-vous avoir le plus besoin": "Méthode" };
  for (const [debut, texte] of Object.entries(reponses)) await apprenant.getByRole("textbox", { name: new RegExp(debut) }).fill(texte);
  await apprenant.getByText("Intermédiaire", { exact: true }).click();
  await apprenant.locator("fieldset").filter({ hasText: "situation de handicap" }).getByText("Non", { exact: true }).click();
  await apprenant.locator("fieldset").filter({ hasText: "programme de la formation" }).getByText("Oui", { exact: true }).click();
  await apprenant.getByRole("button", { name: "Enregistrer et reprendre plus tard" }).click();
  await expect(apprenant.getByText(/Enregistré le/)).toBeVisible();
  for (const q of await apprenant.locator("section[aria-labelledby='partie-b'] fieldset").all()) await q.getByRole("radio").last().check();
  await apprenant.getByLabel("Fait à").fill("Mulhouse");
  await tracer(apprenant);
  await apprenant.getByRole("checkbox").check();
  await apprenant.getByRole("button", { name: "Signer et envoyer" }).click();
  await expect(apprenant.getByText("Votre positionnement est complet et signé")).toBeVisible();
  await expect(apprenant.getByRole("link", { name: /Télécharger mon positionnement/ })).toBeVisible();

  // Côté formateur : complet, PDF disponible, et visible dans le coffre-fort du parcours.
  await page.goto("/positionnements");
  await expect(page.getByText("Complet et signé")).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF signé" })).toBeVisible();
  await page.goto("/coffres");
  await page.getByRole("link", { name: /Améliorer ma prospection/ }).click();
  await page.getByRole("tab", { name: /Administratif/ }).click();
  await expect(page.getByRole("link", { name: "PDF signé" })).toBeVisible();
});

test("formatrice de démonstration : le coffre-fort du parcours généré contient ses 4 supports PPTX et son programme", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill("formatrice@demo.example");
  await page.getByLabel("Mot de passe").fill("demonstration-s4m");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("/");
  await page.goto("/coffres");
  await page.getByRole("link", { name: /Prospection commerciale B2B/ }).click();
  await expect(page.getByText(/Support — Module \d/)).toHaveCount(4);
  await expect(page.getByRole("link", { name: "PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tout télécharger/ })).toBeVisible();
});
