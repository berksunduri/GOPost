import React from "react";
import { AppStatusProvider } from "@/context/AppStatusContext";
import { TabsProvider } from "@/context/TabsContext";
import { HistoryProvider } from "@/context/HistoryContext";
import { RequestsProvider } from "@/context/RequestsContext";
import { CollectionsProvider } from "@/context/CollectionsContext";
import { EnvironmentsProvider } from "@/context/EnvironmentsContext";

export function AllProviders({ children }) {
  return (
    <AppStatusProvider>
      <TabsProvider>
        <HistoryProvider>
          <RequestsProvider>
            <CollectionsProvider>
              <EnvironmentsProvider>{children}</EnvironmentsProvider>
            </CollectionsProvider>
          </RequestsProvider>
        </HistoryProvider>
      </TabsProvider>
    </AppStatusProvider>
  );
}

export function BaseProviders({ children }) {
  return (
    <AppStatusProvider>
      <TabsProvider>{children}</TabsProvider>
    </AppStatusProvider>
  );
}

export function WithHistory({ children }) {
  return (
    <AppStatusProvider>
      <HistoryProvider>{children}</HistoryProvider>
    </AppStatusProvider>
  );
}

export function WithEnvironments({ children }) {
  return (
    <AppStatusProvider>
      <EnvironmentsProvider>{children}</EnvironmentsProvider>
    </AppStatusProvider>
  );
}

export function WithRequests({ children }) {
  return (
    <AppStatusProvider>
      <TabsProvider>
        <RequestsProvider>{children}</RequestsProvider>
      </TabsProvider>
    </AppStatusProvider>
  );
}
