// Physical constants for LAMMPS "real" unit system.
// Distance: Å  |  Time: fs  |  Energy: kcal/mol  |  Mass: amu  |  Force: kcal/(mol·Å)
export const KB         = 0.001987;   // kcal / (mol·K)  — Boltzmann constant
export const FORCE_CONV = 4.184e-4;   // (Å/fs)² per (kcal/mol) per amu  (= 1/mvv2e, LAMMPS real)
